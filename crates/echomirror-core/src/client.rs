use crate::cache::{CacheValidatorKind, ResponseCache};
use crate::circuit_breaker::CircuitBreaker;
use crate::middleware::{
    MiddlewareDecision, MiddlewareOutcome, MiddlewareRequest, MiddlewareResponse,
    MAX_MIDDLEWARE_RETRIES,
};
use crate::{ClientMetrics, EchoMirrorConfig, EchoMirrorError, MetricsSnapshot, Result};
use reqwest::header::{
    HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, IF_MODIFIED_SINCE, IF_NONE_MATCH,
};
use reqwest::{Client as HttpClient, Method, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tokio::time::sleep;

/// What a single HTTP attempt (one call to `request_once`) resolved to.
enum AttemptOutcome<T> {
    Success(T),
    Error(EchoMirrorError),
    /// A middleware's `after_response` asked for an immediate retry (e.g.
    /// after refreshing an expired auth token). Doesn't count against
    /// `max_retries` and skips backoff — see `crate::middleware` docs.
    RetryNow,
}

#[derive(Debug, Clone)]
pub struct EchoMirrorClient {
    pub(crate) config: Arc<EchoMirrorConfig>,
    http: HttpClient,
    auth_token: Arc<RwLock<Option<String>>>,
    // Track if we've already attempted token refresh to prevent infinite loops
    token_refresh_attempted: Arc<RwLock<bool>>,
    // Metrics for observability
    metrics: Arc<ClientMetrics>,
    // Circuit breaker for failing fast on sustained outages
    circuit_breaker: Arc<CircuitBreaker>,
    // ETag/conditional-request response cache
    cache: ResponseCache,
}

impl EchoMirrorClient {
    pub fn new(config: EchoMirrorConfig) -> Result<Self> {
        let http = HttpClient::builder()
            .timeout(config.timeout)
            .user_agent(concat!("echomirror-rust-sdk/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(EchoMirrorError::Network)?;

        let metrics = Arc::new(ClientMetrics::new());
        let circuit_breaker = Arc::new(CircuitBreaker::new(
            config.circuit_breaker.clone(),
            metrics.clone(),
        ));
        let cache = ResponseCache::new(config.cache.clone());

        Ok(Self {
            config: Arc::new(config),
            http,
            auth_token: Arc::new(RwLock::new(None)),
            token_refresh_attempted: Arc::new(RwLock::new(false)),
            metrics,
            circuit_breaker,
            cache,
        })
    }

    pub async fn set_auth_token(&self, token: Option<String>) {
        *self.auth_token.write().await = token;
    }

    pub fn config(&self) -> &EchoMirrorConfig {
        &self.config
    }

    /// Get a reference to the client's circuit breaker
    pub fn circuit_breaker(&self) -> &Arc<CircuitBreaker> {
        &self.circuit_breaker
    }

    /// Get a snapshot of the current metrics
    pub fn metrics(&self) -> MetricsSnapshot {
        self.metrics.snapshot()
    }

    /// Get a reference to the response cache
    pub fn cache(&self) -> &ResponseCache {
        &self.cache
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
        let was_probe = self.circuit_breaker.before_request().await?;

        let mut attempt = 0;
        let max_attempts = self.config.max_retries + 1;
        let mut middleware_retries = 0;

        self.metrics.record_request();

        loop {
            attempt += 1;

            match self
                .request_once::<B, T>(method.clone(), path, body, timeout_override, attempt)
                .await
            {
                AttemptOutcome::Success(result) => {
                    self.circuit_breaker.on_success(was_probe).await;
                    self.metrics.record_success();
                    // Reset token refresh flag on success
                    *self.token_refresh_attempted.write().await = false;
                    return Ok(result);
                }
                AttemptOutcome::RetryNow => {
                    middleware_retries += 1;
                    if middleware_retries > MAX_MIDDLEWARE_RETRIES {
                        self.metrics.record_failure();
                        return Err(EchoMirrorError::Auth(
                            "middleware requested a retry too many times".to_string(),
                        ));
                    }
                    // Doesn't count against max_retries/backoff: retry same attempt slot.
                    attempt -= 1;
                    continue;
                }
                AttemptOutcome::Error(err) => {
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
                        let is_backend_failure = matches!(&err, EchoMirrorError::Network(_))
                            || matches!(
                                &err,
                                EchoMirrorError::Http { status, .. } if *status >= 500
                            );
                        self.circuit_breaker
                            .on_failure(is_backend_failure, was_probe)
                            .await;
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
        attempt: u32,
    ) -> AttemptOutcome<T> {
        let url = format!("{}{}", self.config.base_url, path);
        let token = self.auth_token.read().await.clone();

        let mut headers = HeaderMap::new();
        match HeaderValue::from_str(&self.config.api_key) {
            Ok(v) => {
                headers.insert("x-api-key", v);
            }
            Err(e) => {
                return AttemptOutcome::Error(EchoMirrorError::Config(format!(
                    "invalid api key: {e}"
                )))
            }
        }
        headers.insert(
            "x-echomirror-network",
            HeaderValue::from_static(match self.config.network {
                crate::config::StellarNetwork::Mainnet => "mainnet",
                crate::config::StellarNetwork::Testnet => "testnet",
            }),
        );
        if let Some(tok) = &token {
            match HeaderValue::from_str(&format!("Bearer {tok}")) {
                Ok(v) => {
                    headers.insert(AUTHORIZATION, v);
                }
                Err(e) => {
                    return AttemptOutcome::Error(EchoMirrorError::Config(format!(
                        "invalid auth token: {e}"
                    )))
                }
            }
        }

        // For GET requests, look up any stored response and send the matching
        // standard conditional header. Keep the entry so a 304 can use exactly
        // the body that was validated without a second cache lookup.
        let is_get = method == Method::GET;
        let cached_entry = if is_get {
            if let Some(entry) = self.cache.get_entry(&url).await {
                self.metrics.record_cache_hit();
                if let Ok(value) = HeaderValue::from_str(&entry.validator) {
                    let header = match entry.validator_kind {
                        CacheValidatorKind::ETag => IF_NONE_MATCH,
                        CacheValidatorKind::LastModified => IF_MODIFIED_SINCE,
                    };
                    headers.insert(header, value);
                }
                Some(entry)
            } else {
                self.metrics.record_cache_miss();
                None
            }
        } else {
            None
        };

        let body_bytes = match body {
            Some(b) => match serde_json::to_vec(b) {
                Ok(bytes) => Some(bytes),
                Err(e) => return AttemptOutcome::Error(EchoMirrorError::Serialization(e)),
            },
            None => None,
        };

        let mut mw_req = MiddlewareRequest {
            method,
            url,
            headers,
            body: body_bytes,
            attempt,
        };

        for mw in &self.config.middlewares {
            mw.before_request(self, &mut mw_req).await;
        }

        let mut req_builder = self.http.request(mw_req.method.clone(), &mw_req.url);
        for (name, value) in mw_req.headers.iter() {
            req_builder = req_builder.header(name.clone(), value.clone());
        }
        if let Some(timeout) = timeout_override {
            req_builder = req_builder.timeout(timeout);
        }
        if let Some(b) = &mw_req.body {
            req_builder = req_builder
                .header(CONTENT_TYPE, "application/json")
                .body(b.clone());
        }

        let started = Instant::now();
        let send_result = req_builder.send().await;

        let http_result: std::result::Result<MiddlewareResponse, EchoMirrorError> =
            match send_result {
                Ok(res) => {
                    let status = res.status();
                    let headers = res.headers().clone();

                    // Handle 304 Not Modified: return the body that supplied
                    // the conditional validator. A corrupt cached body is an
                    // ordinary invalid-response error, never a client panic.
                    if status == StatusCode::NOT_MODIFIED {
                        return match cached_entry {
                            Some(entry) => match serde_json::from_slice(&entry.body) {
                                Ok(value) => AttemptOutcome::Success(value),
                                Err(error) => {
                                    AttemptOutcome::Error(EchoMirrorError::InvalidResponse(
                                        format!("Failed to parse cached response: {error}"),
                                    ))
                                }
                            },
                            None => AttemptOutcome::Error(EchoMirrorError::Http {
                                status: 304,
                                message: "Not Modified but no cached body available".to_string(),
                            }),
                        };
                    }

                    match res.bytes().await {
                        Ok(bytes) => Ok(MiddlewareResponse {
                            status,
                            headers,
                            body: bytes.to_vec(),
                            duration: started.elapsed(),
                        }),
                        Err(e) => Err(EchoMirrorError::Network(e)),
                    }
                }
                Err(e) => Err(EchoMirrorError::Network(e)),
            };

        let outcome = match &http_result {
            Ok(res) => MiddlewareOutcome::Response(res),
            Err(err) => MiddlewareOutcome::Error(err),
        };

        for mw in &self.config.middlewares {
            if mw.after_response(self, &mw_req, &outcome).await == MiddlewareDecision::RetryNow {
                return AttemptOutcome::RetryNow;
            }
        }

        let res = match http_result {
            Ok(res) => res,
            Err(err) => return AttemptOutcome::Error(err),
        };

        match res.status {
            StatusCode::UNAUTHORIZED => AttemptOutcome::Error(EchoMirrorError::AuthExpired),
            StatusCode::TOO_MANY_REQUESTS => {
                let retry = res
                    .headers
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(60);
                AttemptOutcome::Error(EchoMirrorError::RateLimit {
                    retry_after_secs: retry,
                })
            }
            StatusCode::NO_CONTENT => {
                // Safety: T must be () for 204 responses
                match serde_json::from_value(serde_json::Value::Null) {
                    Ok(v) => AttemptOutcome::Success(v),
                    Err(e) => AttemptOutcome::Error(EchoMirrorError::Serialization(e)),
                }
            }
            s if !s.is_success() => {
                let msg = String::from_utf8_lossy(&res.body).into_owned();
                AttemptOutcome::Error(EchoMirrorError::Http {
                    status: s.as_u16(),
                    message: msg,
                })
            }
            _ => {
                // Success — cache GET responses that carry a standard
                // validator. The cache reports capacity evictions so metrics
                // remain observable alongside hits and misses.
                if is_get {
                    let evicted =
                        if let Some(etag) = res.headers.get("etag").and_then(|v| v.to_str().ok()) {
                            self.cache
                                .put(mw_req.url.clone(), etag.to_string(), res.body.clone())
                                .await
                        } else if let Some(last_modified) = res
                            .headers
                            .get("last-modified")
                            .and_then(|v| v.to_str().ok())
                        {
                            self.cache
                                .put_with_validator(
                                    mw_req.url.clone(),
                                    last_modified.to_string(),
                                    CacheValidatorKind::LastModified,
                                    res.body.clone(),
                                )
                                .await
                        } else {
                            false
                        };
                    if evicted {
                        self.metrics.record_cache_eviction();
                    }
                }
                match serde_json::from_slice::<T>(&res.body) {
                    Ok(v) => AttemptOutcome::Success(v),
                    Err(e) => AttemptOutcome::Error(EchoMirrorError::InvalidResponse(format!(
                        "Failed to parse response: {e}"
                    ))),
                }
            }
        }
    }
}
