use echomirror_core::{EchoMirrorError, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

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

    /// Fetch a page of payment operations for an account.
    ///
    /// Payment records carry `from`/`to`/`asset_code`/`amount` — the fields the
    /// sync engine's filters match on. Pass `join_transactions` to embed the
    /// parent transaction record (ledger sequence + memo) in each payment.
    pub async fn get_payments(
        &self,
        public_key: &str,
        cursor: Option<&str>,
        limit: u16,
        join_transactions: bool,
    ) -> Result<HorizonPaymentPage> {
        let mut url = format!(
            "{}/accounts/{}/payments?limit={}&order=asc",
            self.base_url, public_key, limit
        );
        if let Some(c) = cursor {
            url.push_str(&format!("&cursor={}", c));
        }
        if join_transactions {
            url.push_str("&join=transactions");
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

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HorizonBalance {
    pub balance: String,
    pub asset_type: String,
    /// Absent for native (XLM) balances — real Horizon omits these keys.
    #[serde(default)]
    pub asset_code: Option<String>,
    #[serde(default)]
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

#[derive(Debug, Deserialize)]
pub struct HorizonPaymentPage {
    #[serde(rename = "_embedded")]
    pub embedded: HorizonPaymentEmbedded,
}

#[derive(Debug, Deserialize)]
pub struct HorizonPaymentEmbedded {
    pub records: Vec<HorizonPaymentRecord>,
}

/// A payment-ish operation record from Horizon's `/payments` endpoints.
///
/// The endpoint returns several operation types (`payment`, `create_account`,
/// `path_payment_strict_send`, `path_payment_strict_receive`, `account_merge`),
/// so most fields are optional — which ones are set depends on `op_type`.
#[derive(Debug, Clone, Deserialize)]
pub struct HorizonPaymentRecord {
    pub id: String,
    pub paging_token: String,
    #[serde(default)]
    pub transaction_successful: bool,
    pub source_account: String,
    #[serde(rename = "type")]
    pub op_type: String,
    pub created_at: String,
    pub transaction_hash: String,
    // payment / path_payment fields
    pub asset_type: Option<String>,
    pub asset_code: Option<String>,
    pub asset_issuer: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub amount: Option<String>,
    // create_account fields
    pub funder: Option<String>,
    pub account: Option<String>,
    pub starting_balance: Option<String>,
    // account_merge field
    pub into: Option<String>,
    /// Present when the request used `join=transactions`
    pub transaction: Option<HorizonJoinedTransaction>,
}

/// Parent transaction embedded in a payment record via `join=transactions`.
#[derive(Debug, Clone, Deserialize)]
pub struct HorizonJoinedTransaction {
    pub ledger: u32,
    pub memo: Option<String>,
}

/// A ledger record from Horizon's `/ledgers` endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct HorizonLedgerRecord {
    pub sequence: u32,
    pub hash: String,
    pub paging_token: String,
    pub closed_at: String,
    pub successful_transaction_count: Option<u32>,
    pub base_fee_in_stroops: Option<u32>,
}
