use std::time::Duration;

#[derive(Debug, Clone)]
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

    pub fn with_horizon_url(mut self, url: impl Into<String>) -> Self {
        self.horizon_url = Some(url.into());
        self
    }

    pub fn with_friendbot_url(mut self, url: impl Into<String>) -> Self {
        self.friendbot_url = Some(url.into());
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
