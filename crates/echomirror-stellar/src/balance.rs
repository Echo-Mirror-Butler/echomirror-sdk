use crate::horizon::HorizonClient;
use chrono::Utc;
use echomirror_core::{EchoMirrorClient, Result, StellarBalance};

const ECHO_ASSET_CODE: &str = "ECHO";

/// Get XLM and ECHO token balance for a Stellar public key.
///
/// Queries Horizon directly — no round-trip through the EchoMirror API.
///
/// ```rust,no_run
/// use echomirror_core::{EchoMirrorClient, EchoMirrorConfig};
/// use echomirror_stellar::get_balance;
///
/// #[tokio::main]
/// async fn main() {
///     let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("api_key")).unwrap();
///     let balance = get_balance(&client, "GPUBLIC_KEY").await.unwrap();
///     println!("{} XLM  •  {} ECHO", balance.xlm, balance.echo);
/// }
/// ```
pub async fn get_balance(client: &EchoMirrorClient, public_key: &str) -> Result<StellarBalance> {
    let horizon = HorizonClient::new(client.config().resolved_horizon_url());
    let balances = horizon.account_balances(public_key).await?;

    let mut xlm = "0".to_string();
    let mut echo = "0".to_string();

    for b in &balances {
        match b.asset_type.as_str() {
            "native" => xlm = b.balance.clone(),
            "credit_alphanum4" | "credit_alphanum12"
                if b.asset_code.as_deref() == Some(ECHO_ASSET_CODE) =>
            {
                echo = b.balance.clone();
            }
            _ => {}
        }
    }

    Ok(StellarBalance {
        xlm,
        echo,
        public_key: public_key.to_string(),
        network: format!("{:?}", client.config().network).to_lowercase(),
        last_fetched: Utc::now(),
    })
}
