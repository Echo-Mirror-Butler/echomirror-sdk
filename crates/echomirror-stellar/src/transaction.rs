use echomirror_core::{EchoMirrorClient, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct EchoTransferParams {
    /// Sender's Stellar public key
    pub from: String,
    /// Recipient's Stellar public key
    pub to: String,
    /// Amount of ECHO tokens to send
    pub amount: f64,
    /// Optional memo (max 28 bytes)
    pub memo: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UnsignedTransaction {
    /// XDR-encoded transaction envelope — pass to Freighter (browser) or sign with secret key
    pub xdr: String,
    /// Expected fee in stroops
    pub fee: u32,
    /// The sequence number used
    pub sequence: String,
}

/// Build an unsigned ECHO token transfer transaction.
///
/// Returns XDR that must be signed by the sender's keypair before submission.
/// In browser: pass `xdr` to Freighter.
/// In Rust server: sign with `stellar_sdk::Keypair`.
///
/// ```rust,no_run
/// use echomirror_core::{EchoMirrorClient, EchoMirrorConfig};
/// use echomirror_stellar::transaction::{build_echo_transfer, EchoTransferParams};
///
/// #[tokio::main]
/// async fn main() {
///     let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("api_key")).unwrap();
///     let unsigned = build_echo_transfer(&client, EchoTransferParams {
///         from: "GSENDER".into(),
///         to: "GRECIPIENT".into(),
///         amount: 5.0,
///         memo: Some("Great work today!".into()),
///     }).await.unwrap();
///     println!("Sign this XDR: {}", unsigned.xdr);
/// }
/// ```
pub async fn build_echo_transfer(
    client: &EchoMirrorClient,
    params: EchoTransferParams,
) -> Result<UnsignedTransaction> {
    client.post("/stellar/build-transfer", &params).await
}
