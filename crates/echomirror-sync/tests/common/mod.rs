#![allow(dead_code)]

pub mod horizon_fixture;

use echomirror_core::{EchoMirrorClient, EchoMirrorConfig, SyncEvent};
use std::time::Duration;
use tokio::sync::broadcast;

/// Client pointed at the fixture instead of real Horizon.
pub fn test_client(horizon_base_url: &str) -> EchoMirrorClient {
    EchoMirrorClient::new(
        EchoMirrorConfig::testnet("test_api_key").with_horizon_url(horizon_base_url),
    )
    .expect("client")
}

/// A payment operation record as Horizon would serialize it.
/// `asset` of `None` means native XLM.
pub fn payment_record(
    token: u64,
    from: &str,
    to: &str,
    asset: Option<&str>,
    amount: &str,
) -> serde_json::Value {
    let mut record = serde_json::json!({
        "id": token.to_string(),
        "paging_token": token.to_string(),
        "transaction_successful": true,
        "source_account": from,
        "type": "payment",
        "created_at": "2026-07-20T21:10:30Z",
        "transaction_hash": format!("hash-{token}"),
        "from": from,
        "to": to,
        "amount": amount,
    });
    match asset {
        None => {
            record["asset_type"] = "native".into();
        }
        Some(code) => {
            record["asset_type"] = "credit_alphanum4".into();
            record["asset_code"] = code.into();
            record["asset_issuer"] = "GISSUER".into();
        }
    }
    record
}

/// Receive the next event or panic after 5s — keeps hung tests from stalling CI.
pub async fn next_event(rx: &mut broadcast::Receiver<SyncEvent>) -> SyncEvent {
    tokio::time::timeout(Duration::from_secs(5), rx.recv())
        .await
        .expect("timed out waiting for sync event")
        .expect("event channel closed")
}

/// Drain events until one matches `pred`, panicking after 5s per event.
pub async fn next_event_matching(
    rx: &mut broadcast::Receiver<SyncEvent>,
    pred: impl Fn(&SyncEvent) -> bool,
) -> SyncEvent {
    loop {
        let event = next_event(rx).await;
        if pred(&event) {
            return event;
        }
    }
}
