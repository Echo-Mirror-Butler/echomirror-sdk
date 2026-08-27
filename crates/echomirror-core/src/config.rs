use std::sync::Arc;
use std::time::Duration;

/// Callback type for token refresh
pub type TokenRefreshCallback =
    Arc<dyn Fn() -> Result<String, Box<dyn std::error::Error + Send + Sync>> + Send + Sync>;

pub struct EchoMirrorConfig {
    /// Your EchoMirror API key
    pub api_key: String,

    /// Base URL of the EchoMirror API (default: https://api.echomirror.dev/v1)
    pub base_url: String,

    /// Stellar network to connect to
    pub network: StellarNetwork,

    /// Request timeout (default: 10s)
    pub timeout: Duration,

    /// Maximum retry attempts on transient failures (default: 3)
    pub max_retries: u32,

    /// Override the Horizon base URL (default: the network's public Horizon).
    /// Useful for self-hosted Horizon instances and tests.
    pub horizon_url: Option<String>,

    /// Override the Friendbot URL (default: the network's public Friendbot,
    /// testnet only). Useful for tests.
    pub friendbot_url: Option<String>,

    /// Optional callback to refresh the auth token when it expires
    pub token_refresh_callback: Option<TokenRefreshCallback>,

    /// Circuit breaker configuration for HTTP client
    pub circuit_breaker: CircuitBreakerConfig,
}

impl Clone for EchoMirrorConfig {
    fn clone(&self) -> Self {
        Self {
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            network: self.network,
            timeout: self.timeout,
            max_retries: self.max_retries,
            horizon_url: self.horizon_url.clone(),
            friendbot_url: self.friendbot_url.clone(),
            token_refresh_callback: self.token_refresh_callback.clone(),
            circuit_breaker: self.circuit_breaker.clone(),
        }
    }
}

impl std::fmt::Debug for EchoMirrorConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EchoMirrorConfig")
            .field("api_key", &self.api_key)
            .field("base_url", &self.base_url)
            .field("network", &self.network)
            .field("timeout", &self.timeout)
            .field("max_retries", &self.max_retries)
            .field("horizon_url", &self.horizon_url)
            .field("friendbot_url", &self.friendbot_url)
            .field(
                "token_refresh_callback",
                &self.token_refresh_callback.as_ref().map(|_| "<callback>"),
            )
            .field("circuit_breaker", &self.circuit_breaker)
            .finish()
    }
}

/// State of the HTTP client's circuit breaker
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

impl Default for CircuitState {
    fn default() -> Self {
        CircuitState::Closed
    }
}

/// Configuration for the HTTP client circuit breaker
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CircuitBreakerConfig {
    /// Number of consecutive backend failures required to trip the circuit (default: 5)
    pub failure_threshold: u32,
    /// Cooldown duration before transitioning from Open to HalfOpen (default: 30s)
    pub cooldown: Duration,
    /// Whether the circuit breaker is enabled (default: true)
    pub enabled: bool,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            cooldown: Duration::from_secs(30),
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StellarNetwork {
    Mainnet,
    Testnet,
}

impl StellarNetwork {
    pub fn horizon_url(&self) -> &'static str {
        match self {
            StellarNetwork::Mainnet => "https://horizon.stellar.org",
            StellarNetwork::Testnet => "https://horizon-testnet.stellar.org",
        }
    }

    pub fn network_passphrase(&self) -> &'static str {
        match self {
            StellarNetwork::Mainnet => "Public Global Stellar Network ; September 2015",
            StellarNetwork::Testnet => "Test SDF Network ; September 2015",
        }
    }

    pub fn friendbot_url(&self) -> Option<&'static str> {
        match self {
            StellarNetwork::Testnet => Some("https://friendbot.stellar.org"),
            StellarNetwork::Mainnet => None,
        }
    }
}

impl EchoMirrorConfig {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            base_url: "https://api.echomirror.dev/v1".to_string(),
            network: StellarNetwork::Mainnet,
            timeout: Duration::from_secs(10),
            max_retries: 3,
            horizon_url: None,
            friendbot_url: None,
            token_refresh_callback: None,
            circuit_breaker: CircuitBreakerConfig::default(),
        }
    }

    pub fn testnet(api_key: impl Into<String>) -> Self {
        Self {
            network: StellarNetwork::Testnet,
            ..Self::new(api_key)
        }
    }

    pub fn with_base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = url.into();
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    pub fn with_horizon_url(mut self, url: impl Into<String>) -> Self {
        self.horizon_url = Some(url.into());
        self
    }

    pub fn with_friendbot_url(mut self, url: impl Into<String>) -> Self {
        self.friendbot_url = Some(url.into());
        self
    }

    pub fn with_token_refresh_callback<F>(mut self, callback: F) -> Self
    where
        F: Fn() -> Result<String, Box<dyn std::error::Error + Send + Sync>> + Send + Sync + 'static,
    {
        self.token_refresh_callback = Some(Arc::new(callback));
        self
    }

    pub fn with_circuit_breaker(mut self, config: CircuitBreakerConfig) -> Self {
        self.circuit_breaker = config;
        self
    }

    pub fn with_circuit_breaker_threshold(mut self, threshold: u32) -> Self {
        self.circuit_breaker.failure_threshold = threshold.max(1);
        self
    }

    pub fn with_circuit_breaker_cooldown(mut self, cooldown: Duration) -> Self {
        self.circuit_breaker.cooldown = cooldown;
        self
    }

    pub fn with_circuit_breaker_enabled(mut self, enabled: bool) -> Self {
        self.circuit_breaker.enabled = enabled;
        self
    }

    /// Resolve the effective Horizon URL: the override if set, else the network default.
    pub fn resolved_horizon_url(&self) -> String {
        self.horizon_url
            .clone()
            .unwrap_or_else(|| self.network.horizon_url().to_string())
    }

    /// Resolve the effective Friendbot URL: the override if set, else the network
    /// default (`None` on mainnet, where there is no Friendbot).
    pub fn resolved_friendbot_url(&self) -> Option<String> {
        self.friendbot_url
            .clone()
            .or_else(|| self.network.friendbot_url().map(str::to_string))
    }
}
