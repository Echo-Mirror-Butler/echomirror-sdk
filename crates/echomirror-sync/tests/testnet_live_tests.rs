//! Live integration tests against the public Stellar Horizon **testnet**.
//!
//! These hit real network infrastructure, so they are `#[ignore]`d and also
//! gated on an env var. Run them explicitly with:
//!
//! ```sh
//! ECHOMIRROR_LIVE_TESTS=1 cargo test -p echomirror-sync -- --ignored
//! ```

mod common;

use echomirror_core::{EchoMirrorClient, EchoMirrorConfig, SyncEvent};
use echomirror_stellar::fund_testnet_account;
use echomirror_sync::{CursorStore, InMemoryCursorStore, SyncCursor, SyncEngine};
use std::sync::Arc;
use std::time::Duration;

fn live_enabled() -> bool {
    if std::env::var("ECHOMIRROR_LIVE_TESTS").as_deref() == Ok("1") {
        true
    } else {
        eprintln!("skipping live testnet test: ECHOMIRROR_LIVE_TESTS != 1");
        false
    }
}

fn testnet_client() -> EchoMirrorClient {
    EchoMirrorClient::new(EchoMirrorConfig::testnet("live_test_key")).expect("client")
}

/// Generate a random (unfunded, unsigned-for) Stellar testnet address.
/// Friendbot only needs a well-formed address — we never sign with it.
fn random_testnet_address() -> String {
    let key: [u8; 32] = rand::random();
    strkey_encode_ed25519(&key)
}

fn strkey_encode_ed25519(key: &[u8; 32]) -> String {
    let mut payload = Vec::with_capacity(35);
    payload.push(6 << 3); // version byte for ed25519 public key → leading 'G'
    payload.extend_from_slice(key);
    let checksum = crc16_xmodem(&payload);
    payload.extend_from_slice(&checksum.to_le_bytes());
    base32_encode(&payload)
}

fn crc16_xmodem(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

fn base32_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut bits: u32 = 0;
    let mut nbits: u32 = 0;
    let mut out = String::new();
    for &byte in data {
        bits = (bits << 8) | byte as u32;
        nbits += 8;
        while nbits >= 5 {
            nbits -= 5;
            out.push(ALPHABET[((bits >> nbits) & 31) as usize] as char);
        }
    }
    if nbits > 0 {
        out.push(ALPHABET[((bits << (5 - nbits)) & 31) as usize] as char);
    }
    out
}

/// Live streaming: attach at the tip of a brand-new account, fund it via
/// Friendbot, and expect the create_account operation to arrive over SSE.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "hits public Horizon testnet — run with ECHOMIRROR_LIVE_TESTS=1 -- --ignored"]
async fn live_streaming_detects_friendbot_funding() {
    if !live_enabled() {
        return;
    }
    let client = testnet_client();
    let account = random_testnet_address();

    let engine = SyncEngine::builder(&client).watch(&account).build();
    let mut events = engine.subscribe();
    engine.clone().start();

    // Give the SSE connection a moment to attach before funding, so the
    // create_account arrives over the live stream rather than backfill.
    tokio::time::sleep(Duration::from_secs(3)).await;

    fund_testnet_account(&client, &account)
        .await
        .expect("friendbot funding");

    let detected = tokio::time::timeout(Duration::from_secs(90), async {
        loop {
            match events.recv().await {
                Ok(SyncEvent::TransactionDetected { tx }) => break tx,
                Ok(_) => continue,
                Err(e) => panic!("event stream closed: {e}"),
            }
        }
    })
    .await
    .expect("timed out waiting for funding event");

    assert_eq!(detected.to, account);
    assert_eq!(detected.asset, "XLM");
    assert!(detected.amount.parse::<f64>().unwrap() >= 9_999.0);

    engine.stop();
    engine.stopped().await;
}

/// Backfill correctness: fund an account first, then start an engine whose
/// cursor points at the beginning of history — the funding operation must be
/// recovered through the paginated backfill path, not the live stream.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "hits public Horizon testnet — run with ECHOMIRROR_LIVE_TESTS=1 -- --ignored"]
async fn live_backfill_recovers_missed_history() {
    if !live_enabled() {
        return;
    }
    let client = testnet_client();
    let account = random_testnet_address();

    fund_testnet_account(&client, &account)
        .await
        .expect("friendbot funding");
    // Let the ledger close and Horizon ingest it.
    tokio::time::sleep(Duration::from_secs(10)).await;

    let store = Arc::new(InMemoryCursorStore::new());
    store
        .save(&account, &SyncCursor::from_ledger(0))
        .await
        .unwrap();

    let engine = SyncEngine::builder(&client)
        .watch(&account)
        .cursor_store(store.clone())
        .build();
    let mut events = engine.subscribe();
    engine.clone().start();

    let detected = tokio::time::timeout(Duration::from_secs(90), async {
        loop {
            match events.recv().await {
                Ok(SyncEvent::TransactionDetected { tx }) => break tx,
                Ok(_) => continue,
                Err(e) => panic!("event stream closed: {e}"),
            }
        }
    })
    .await
    .expect("timed out waiting for backfilled funding event");

    assert_eq!(detected.to, account);
    assert!(engine.metrics().backfill_records >= 1);

    // The cursor advanced past the recovered history.
    let cursor = store.load(&account).await.unwrap().expect("cursor saved");
    assert_ne!(cursor.paging_token, "0");

    engine.stop();
    engine.stopped().await;
}
