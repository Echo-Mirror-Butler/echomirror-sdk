use crate::{ClientMetrics, EchoMirrorConfig, EchoMirrorError, MetricsSnapshot, Result};
use reqwest::{Client as HttpClient, Method, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::sleep;

#[derive(Debug, Clone)]
pub struct EchoMirrorClient {
    pub(crate) config: Arc<EchoMirrorConfig>,
    http: HttpClient,
    auth_token: Arc<RwLock<Option<String>>>,
    // Track if we've already attempted token refresh to prevent infinite loops
    token_refresh_attempted: Arc<RwLock<bool>>,
    // Metrics for observability
    metrics: Arc<ClientMetrics>,
}

impl EchoMirrorClient {
    pub fn new(config: EchoMirrorConfig) -> Result<Self> {
        let http = HttpClient::builder()
            .timeout(config.timeout)
            .user_agent(concat!("echomirror-rust-sdk/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(EchoMirrorError::Network)?;

        Ok(Self {
            config: Arc::new(config),
            http,
            auth_token: Arc::new(RwLock::new(None)),
            token_refresh_attempted: Arc::new(RwLock::new(false)),
            metrics: Arc::new(ClientMetrics::new()),
        })
    }

    pub async fn set_auth_token(&self, token: Option<String>) {
        *self.auth_token.write().await = token;
    }

    pub fn config(&self) -> &EchoMirrorConfig {
        &self.config
    }

    /// Get a snapshot of the current metrics
    pub fn metrics(&self) -> MetricsSnapshot {
        self.metrics.snapshot()
    }

    /// Reset all metrics to zero
    pub fn reset_metrics(&self) {
        self.metrics.reset()
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        self.request::<(), T>(Method::GET, path, None, None).await
    }

    pub async fn get_with_timeout<T: DeserializeOwned>(
        &self,
        path: &str,
        timeout: Duration,
    ) -> Result<T> {
        self.request::<(), T>(Method::GET, path, None, Some(timeout))
            .await
    }

    pub async fn post<B: Serialize, T: DeserializeOwned>(&self, path: &str, body: &B) -> Result<T> {
        self.request(Method::POST, path, Some(body), None).await
    }

    pub async fn post_with_timeout<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
        timeout: Duration,
    ) -> Result<T> {
        self.request(Method::POST, path, Some(body), Some(timeout))
            .await
    }

    /// POST with no request body (e.g. trigger-style endpoints).
    pub async fn post_empty<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        self.request::<(), T>(Method::POST, path, None, None).await
    }

    pub async fn delete(&self, path: &str) -> Result<()> {
        self.request::<(), ()>(Method::DELETE, path, None, None)
            .await
    }

    async fn request<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        timeout_override: Option<Duration>,
    ) -> Result<T> {
        let mut attempt = 0;
        let max_attempts = self.config.max_retries + 1;

        self.metrics.record_request();

        loop {
            attempt += 1;

            match self
                .request_once::<B, T>(method.clone(), path, body, timeout_override)
                .await
            {
                Ok(result) => {
                    self.metrics.record_success();
                    // Reset token refresh flag on success
                    *self.token_refresh_attempted.write().await = false;
                    return Ok(result);
                }
                Err(err) => {
                    // Record error type metrics
                    self.record_error_metrics(&err);

                    // Check if this is an auth expired error and we haven't tried refreshing yet
                    if err.is_auth_expired() {
                        let mut refresh_attempted = self.token_refresh_attempted.write().await;
                        if !*refresh_attempted {
                            *refresh_attempted = true;
                            drop(refresh_attempted);

                            // Attempt token refresh
                            if let Some(refresh_callback) = &self.config.token_refresh_callback {
                                self.metrics.record_token_refresh_attempt();
                                match refresh_callback() {
                                    Ok(new_token) => {
                                        self.metrics.record_token_refresh_success();
                                        *self.auth_token.write().await = Some(new_token);
                                        // Retry immediately with new token (counts as a new attempt)
                                        continue;
                                    }
                                    Err(e) => {
                                        self.metrics.record_token_refresh_failure();
                                        return Err(EchoMirrorError::Auth(format!(
                                            "Token refresh failed: {}",
                                            e
                                        )));
                                    }
                                }
                            }
                        }
                    }

                    // Check if we should retry
                    if attempt >= max_attempts || !err.is_retryable() {
                        self.metrics.record_failure();
                        // Reset token refresh flag on final failure
                        *self.token_refresh_attempted.write().await = false;
                        return Err(err);
                    }

                    self.metrics.record_retry();

                    // Calculate backoff with jitter
                    let backoff = self.calculate_backoff(attempt - 1);

                    // If rate limited, use the server's retry-after header if available
                    if let EchoMirrorError::RateLimit { retry_after_secs } = &err {
                        self.metrics
                            .record_backoff(Duration::from_secs(*retry_after_secs));
                        sleep(Duration::from_secs(*retry_after_secs)).await;
                    } else {
                        self.metrics.record_backoff(backoff);
                        sleep(backoff).await;
                    }
                }
            }
        }
    }

    /// Calculate exponential backoff with jitter
    fn calculate_backoff(&self, attempt: u32) -> Duration {
        // Base delay of 100ms, exponential backoff: 100ms * 2^attempt
        let base_ms = 100u64;
        let exponential_delay = base_ms * 2u64.pow(attempt);
        // Cap at 5 seconds
        let capped_delay = exponential_delay.min(5000);
        // Add jitter: +/- 25% of the delay
        let jitter = (capped_delay / 4) as f64;
        let random_jitter = (rand::random::<f64>() - 0.5) * 2.0 * jitter;
        let final_delay = (capped_delay as f64 + random_jitter).max(0.0) as u64;
        Duration::from_millis(final_delay)
    }

    /// Record error-specific metrics
    fn record_error_metrics(&self, err: &EchoMirrorError) {
        match err {
            EchoMirrorError::RateLimit { .. } => {
                self.metrics.record_rate_limit_error();
            }
            EchoMirrorError::Network(_) => {
                self.metrics.record_network_error();
            }
            EchoMirrorError::Http { status, .. } => {
                if *status >= 500 {
                    self.metrics.record_server_error();
                } else if *status >= 400 {
                    self.metrics.record_client_error();
                }
            }
            EchoMirrorError::AuthExpired => {
                self.metrics.record_auth_expired_error();
            }
            _ => {}
        }
    }

    async fn request_once<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        timeout_override: Option<Duration>,
    ) -> Result<T> {
        let url = format!("{}{}", self.config.base_url, path);
        let token = self.auth_token.read().await.clone();

        let mut req_builder = self
            .http
            .request(method, &url)
            .header("x-api-key", &self.config.api_key)
            .header(
                "x-echomirror-network",
                format!("{:?}", self.config.network).to_lowercase(),
            );

        // Apply timeout override if provided
        if let Some(timeout) = timeout_override {
            req_builder = req_builder.timeout(timeout);
        }

        if let Some(tok) = &token {
            req_builder = req_builder.bearer_auth(tok);
        }
        if let Some(b) = body {
            req_builder = req_builder.json(b);
        }

        let res = req_builder.send().await?;
        let status = res.status();

        match status {
            StatusCode::UNAUTHORIZED => {
                return Err(EchoMirrorError::AuthExpired);
            }
            StatusCode::TOO_MANY_REQUESTS => {
                let retry = res
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(60);
                return Err(EchoMirrorError::RateLimit {
                    retry_after_secs: retry,
                });
            }
            StatusCode::NO_CONTENT => {
                // Safety: T must be () for 204 responses
                return Ok(serde_json::from_value(serde_json::Value::Null)?);
            }
            s if !s.is_success() => {
                let msg = res.text().await.unwrap_or_default();
                return Err(EchoMirrorError::Http {
                    status: s.as_u16(),
                    message: msg,
                });
            }
            _ => {}
        }

        res.json::<T>().await.map_err(|e| {
            EchoMirrorError::InvalidResponse(format!("Failed to parse response: {}", e))
        })
    }
}
