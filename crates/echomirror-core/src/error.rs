use thiserror::Error;

pub type Result<T> = std::result::Result<T, EchoMirrorError>;

#[derive(Debug, Error)]
pub enum EchoMirrorError {
    #[error("HTTP error {status}: {message}")]
    Http { status: u16, message: String },

    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Authentication token expired")]
    AuthExpired,

    #[error("Rate limit exceeded — retry after {retry_after_secs}s")]
    RateLimit { retry_after_secs: u64 },

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Invalid response from server: {0}")]
    InvalidResponse(String),

    #[error("Stellar error: {0}")]
    Stellar(String),

    #[error("Blockchain sync error: {0}")]
    Sync(String),

    #[error("Invalid configuration: {0}")]
    Config(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("{0}")]
    Other(String),
}

impl EchoMirrorError {
    /// Returns true if this error is retryable (transient failures)
    pub fn is_retryable(&self) -> bool {
        match self {
            // Network errors are retryable (connection issues, timeouts, etc.)
            EchoMirrorError::Network(_) => true,
            // 5xx server errors are retryable
            EchoMirrorError::Http { status, .. } if *status >= 500 => true,
            // 4xx client errors are NOT retryable
            EchoMirrorError::Http { status, .. } if *status >= 400 && *status < 500 => false,
            // Rate limit errors are retryable (with backoff)
            EchoMirrorError::RateLimit { .. } => true,
            // Auth expired is retryable after token refresh
            EchoMirrorError::AuthExpired => true,
            // Other errors are not retryable
            _ => false,
        }
    }

    /// Returns true if this error indicates the auth token should be refreshed
    pub fn is_auth_expired(&self) -> bool {
        matches!(self, EchoMirrorError::AuthExpired)
    }
}
