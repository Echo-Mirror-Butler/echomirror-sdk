use echomirror_core::{EchoMirrorError, Result, StellarBalance, StellarTransaction};
use reqwest::Client;
use serde::Deserialize;

/// Direct Horizon API client — bypasses EchoMirror API for raw Stellar operations.
/// Used by the sync engine and for balance lookups.
pub struct HorizonClient {
    http: Client,
    base_url: String,
}

impl HorizonClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            http: Client::new(),
            base_url: base_url.into(),
        }
    }

    pub fn mainnet() -> Self {
        Self::new("https://horizon.stellar.org")
    }

    pub fn testnet() -> Self {
        Self::new("https://horizon-testnet.stellar.org")
    }

    /// Get account balances directly from Horizon.
    pub async fn account_balances(&self, public_key: &str) -> Result<Vec<HorizonBalance>> {
        let url = format!("{}/accounts/{}", self.base_url, public_key);
        let res = self
            .http
            .get(&url)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(EchoMirrorError::Network)?;

        if res.status().as_u16() == 404 {
            return Err(EchoMirrorError::NotFound(format!(
                "Account {} not found on network",
                public_key
            )));
        }
        if !res.status().is_success() {
            return Err(EchoMirrorError::Http {
                status: res.status().as_u16(),
                message: res.text().await.unwrap_or_default(),
            });
        }

        let account: HorizonAccount = res.json().await.map_err(EchoMirrorError::Network)?;
        Ok(account.balances)
    }

    /// Stream transactions for an account using Horizon SSE.
    /// Returns a cursor string that can be passed to resume.
    pub async fn get_transactions(
        &self,
        public_key: &str,
        cursor: Option<&str>,
        limit: u8,
    ) -> Result<HorizonTransactionPage> {
        let mut url = format!(
            "{}/accounts/{}/transactions?limit={}&order=asc",
            self.base_url, public_key, limit
        );
        if let Some(c) = cursor {
            url.push_str(&format!("&cursor={}", c));
        }

        let res = self
            .http
            .get(&url)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(EchoMirrorError::Network)?;

        if !res.status().is_success() {
            return Err(EchoMirrorError::Http {
                status: res.status().as_u16(),
                message: res.text().await.unwrap_or_default(),
            });
        }

        res.json().await.map_err(EchoMirrorError::Network)
    }
}

#[derive(Debug, Deserialize)]
pub struct HorizonAccount {
    pub balances: Vec<HorizonBalance>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HorizonBalance {
    pub balance: String,
    pub asset_type: String,
    pub asset_code: Option<String>,
    pub asset_issuer: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HorizonTransactionPage {
    #[serde(rename = "_embedded")]
    pub embedded: HorizonTransactionEmbedded,
}

#[derive(Debug, Deserialize)]
pub struct HorizonTransactionEmbedded {
    pub records: Vec<HorizonTransactionRecord>,
}

#[derive(Debug, Deserialize)]
pub struct HorizonTransactionRecord {
    pub id: String,
    pub paging_token: String,
    pub hash: String,
    pub ledger: u32,
    pub created_at: String,
    pub memo: Option<String>,
    pub fee_charged: String,
}
