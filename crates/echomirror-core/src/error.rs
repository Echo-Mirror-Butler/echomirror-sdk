use thiserror::Error;

pub type Result<T> = std::result::Result<T, EchoMirrorError>;

#[derive(Debug, Error)]
pub enum EchoMirrorError {
    #[error("HTTP error {status}: {message}")]
    Http { status: u16, message: String },

    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Rate limit exceeded — retry after {retry_after_secs}s")]
    RateLimit { retry_after_secs: u64 },

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

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
