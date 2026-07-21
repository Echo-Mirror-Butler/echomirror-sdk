use echomirror_core::{EchoMirrorClient, EchoMirrorError, Result};
use reqwest::Client;

/// Fund a Stellar testnet account using Friendbot (gives 10,000 XLM).
/// Returns an error if called on mainnet — testnet only.
///
/// ```rust,no_run
/// use echomirror_core::{EchoMirrorClient, EchoMirrorConfig};
/// use echomirror_stellar::fund_testnet_account;
///
/// #[tokio::main]
/// async fn main() {
///     let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("api_key")).unwrap();
///     fund_testnet_account(&client, "GPUBLIC_KEY").await.unwrap();
///     println!("Funded! Account now has 10,000 XLM on testnet.");
/// }
/// ```
pub async fn fund_testnet_account(client: &EchoMirrorClient, public_key: &str) -> Result<()> {
    let friendbot_url = client.config().network.friendbot_url().ok_or_else(|| {
        EchoMirrorError::Config("fund_testnet_account is only available on testnet".into())
    })?;

    let url = format!("{}?addr={}", friendbot_url, public_key);
    let res = Client::new()
        .get(&url)
        .send()
        .await
        .map_err(EchoMirrorError::Network)?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(EchoMirrorError::Stellar(format!(
            "Friendbot funding failed: {}",
            body
        )));
    }

    Ok(())
}
