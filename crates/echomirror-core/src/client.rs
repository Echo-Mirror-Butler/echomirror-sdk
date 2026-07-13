use crate::{EchoMirrorConfig, EchoMirrorError, Result};
use reqwest::{Client as HttpClient, Method, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct EchoMirrorClient {
    pub(crate) config: Arc<EchoMirrorConfig>,
    http: HttpClient,
    auth_token: Arc<RwLock<Option<String>>>,
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
        })
    }

    pub async fn set_auth_token(&self, token: Option<String>) {
        *self.auth_token.write().await = token;
    }

    pub fn config(&self) -> &EchoMirrorConfig {
        &self.config
    }

    pub(crate) async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        self.request::<(), T>(Method::GET, path, None).await
    }

    pub(crate) async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T> {
        self.request(Method::POST, path, Some(body)).await
    }

    pub(crate) async fn delete(&self, path: &str) -> Result<()> {
        self.request::<(), ()>(Method::DELETE, path, None).await
    }

    async fn request<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let url = format!("{}{}", self.config.base_url, path);
        let token = self.auth_token.read().await.clone();

        let mut req = self
            .http
            .request(method, &url)
            .header("x-api-key", &self.config.api_key)
            .header("x-echomirror-network", format!("{:?}", self.config.network).to_lowercase());

        if let Some(tok) = &token {
            req = req.bearer_auth(tok);
        }
        if let Some(b) = body {
            req = req.json(b);
        }

        let res = req.send().await?;
        let status = res.status();

        match status {
            StatusCode::UNAUTHORIZED => {
                return Err(EchoMirrorError::Auth("Invalid or expired API key".into()))
            }
            StatusCode::TOO_MANY_REQUESTS => {
                let retry = res
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(60);
                return Err(EchoMirrorError::RateLimit { retry_after_secs: retry });
            }
            StatusCode::NO_CONTENT => {
                // Safety: T must be () for 204 responses
                return Ok(serde_json::from_value(serde_json::Value::Null)?);
            }
            s if !s.is_success() => {
                let msg = res.text().await.unwrap_or_default();
                return Err(EchoMirrorError::Http { status: s.as_u16(), message: msg });
            }
            _ => {}
        }

        Ok(res.json::<T>().await?)
    }
}
