//! Normal streaming, filtering, dedup, and shutdown against the local fixture.

mod common;

use common::horizon_fixture::HorizonFixture;
use common::{next_event, next_event_matching, payment_record, test_client};
use echomirror_core::SyncEvent;
use echomirror_sync::{CursorStore, InMemoryCursorStore, SyncEngine, SyncFilter};
use std::sync::Arc;
use std::time::Duration;

const ACCOUNT: &str = "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6";

#[tokio::test(flavor = "multi_thread")]
async fn streams_live_payments_and_persists_cursor() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let store = Arc::new(InMemoryCursorStore::new());

    let engine = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .cursor_store(store.clone())
        .build();
    let mut events = engine.subscribe();
    engine.clone().start();

    // Fresh store → genesis cursor → no backfill, SSE attaches at the tip.
    assert!(matches!(
        next_event(&mut events).await,
        SyncEvent::SyncStarted { from_ledger: 0 }
    ));
    fixture.wait_for_sse_connections(1).await;

    fixture.push_event(&payment_record(
        101,
        "GSENDER",
        ACCOUNT,
        Some("ECHO"),
        "5.0000000",
    ));
    fixture.push_event(&payment_record(
        102,
        ACCOUNT,
        "GRECIPIENT",
        None,
        "1.5000000",
    ));

    let SyncEvent::TransactionDetected { tx } = next_event(&mut events).await else {
        panic!("expected first TransactionDetected");
    };
    assert_eq!(tx.id, "101");
    assert_eq!(tx.asset, "ECHO");
    assert_eq!(tx.from, "GSENDER");
    assert_eq!(tx.to, ACCOUNT);
    assert_eq!(tx.tx_type, echomirror_core::TransactionType::Receive);

    let SyncEvent::TransactionDetected { tx } = next_event(&mut events).await else {
        panic!("expected second TransactionDetected");
    };
    assert_eq!(tx.id, "102");
    assert_eq!(tx.asset, "XLM");
    assert_eq!(tx.tx_type, echomirror_core::TransactionType::Send);

    // Cursor persisted at the last processed record.
    let cursor = store.load(ACCOUNT).await.unwrap().expect("cursor saved");
    assert_eq!(cursor.paging_token, "102");
    assert_eq!(cursor.total_processed, 2);

    // The live stream attached at the tip.
    let requests = fixture.requests();
    assert!(
        requests
            .iter()
            .any(|r| r.starts_with("SSE") && r.contains("cursor=now")),
        "expected SSE attach at cursor=now, got {requests:?}"
    );

    let snapshot = engine.metrics();
    assert_eq!(snapshot.events_emitted, 2);
    assert_eq!(snapshot.reconnects, 0);
    assert!(snapshot.cursor_lag_seconds().is_some());

    engine.stop();
    engine.stopped().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn filters_match_real_fields_but_cursor_still_advances() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let store = Arc::new(InMemoryCursorStore::new());

    let engine = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .filter(SyncFilter::new().asset("ECHO").min_amount(5.0))
        .cursor_store(store.clone())
        .build();
    let mut events = engine.subscribe();
    engine.clone().start();
    fixture.wait_for_sse_connections(1).await;

    // XLM (wrong asset), ECHO 2.0 (below min), ECHO 10 (matches).
    fixture.push_event(&payment_record(201, "GSENDER", ACCOUNT, None, "50.0000000"));
    fixture.push_event(&payment_record(
        202,
        "GSENDER",
        ACCOUNT,
        Some("ECHO"),
        "2.0000000",
    ));
    fixture.push_event(&payment_record(
        203,
        "GSENDER",
        ACCOUNT,
        Some("ECHO"),
        "10.0000000",
    ));

    let event = next_event_matching(&mut events, |e| {
        matches!(e, SyncEvent::TransactionDetected { .. })
    })
    .await;
    let SyncEvent::TransactionDetected { tx } = event else {
        unreachable!()
    };
    assert_eq!(tx.id, "203");

    // Filtered-out records still advanced and persisted the cursor.
    let cursor = store.load(ACCOUNT).await.unwrap().expect("cursor saved");
    assert_eq!(cursor.paging_token, "203");

    let snapshot = engine.metrics();
    assert_eq!(snapshot.events_emitted, 1);
    assert_eq!(snapshot.events_filtered, 2);

    engine.stop();
    engine.stopped().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn duplicate_tokens_are_emitted_exactly_once() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());

    let engine = SyncEngine::builder(&client).watch(ACCOUNT).build();
    let mut events = engine.subscribe();
    engine.clone().start();
    fixture.wait_for_sse_connections(1).await;

    let record = payment_record(301, "GSENDER", ACCOUNT, Some("ECHO"), "1.0000000");
    fixture.push_event(&record);
    fixture.push_event(&record); // replay of the same token
    fixture.push_event(&payment_record(
        302,
        "GSENDER",
        ACCOUNT,
        Some("ECHO"),
        "2.0000000",
    ));

    let SyncEvent::TransactionDetected { tx } = next_event_matching(&mut events, |e| {
        matches!(e, SyncEvent::TransactionDetected { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(tx.id, "301");

    let SyncEvent::TransactionDetected { tx } = next_event_matching(&mut events, |e| {
        matches!(e, SyncEvent::TransactionDetected { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(tx.id, "302", "the replayed 301 must not be re-emitted");

    assert_eq!(engine.metrics().events_deduped, 1);

    engine.stop();
    engine.stopped().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn stop_emits_sync_completed_and_persists_cursor() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let store = Arc::new(InMemoryCursorStore::new());

    let engine = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .cursor_store(store.clone())
        .build();
    let mut events = engine.subscribe();
    engine.clone().start();
    fixture.wait_for_sse_connections(1).await;

    fixture.push_event(&payment_record(
        401,
        "GSENDER",
        ACCOUNT,
        Some("ECHO"),
        "3.0000000",
    ));
    next_event_matching(&mut events, |e| {
        matches!(e, SyncEvent::TransactionDetected { .. })
    })
    .await;

    engine.stop();
    engine.stopped().await;

    let completed = next_event_matching(&mut events, |e| {
        matches!(e, SyncEvent::SyncCompleted { .. })
    })
    .await;
    let SyncEvent::SyncCompleted { total_processed } = completed else {
        unreachable!()
    };
    assert_eq!(total_processed, 1);

    let cursor = store.load(ACCOUNT).await.unwrap().expect("cursor saved");
    assert_eq!(cursor.paging_token, "401");
}

#[tokio::test(flavor = "multi_thread")]
async fn idle_timeout_triggers_reconnect() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());

    let engine = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .idle_timeout(Duration::from_millis(300))
        .reconnect_backoff(Duration::from_millis(10), Duration::from_millis(50))
        .build();
    let mut events = engine.subscribe();
    engine.clone().start();
    fixture.wait_for_sse_connections(1).await;

    // Send nothing: the idle watchdog must declare the stream dead.
    next_event_matching(&mut events, |e| matches!(e, SyncEvent::SyncPaused { .. })).await;
    assert!(engine.metrics().reconnects >= 1);

    engine.stop();
    engine.stopped().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn lagged_consumer_receives_gap_detected_event_and_updates_metrics() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());

    // Small channel capacity so buffer overflows quickly on slow consumer
    let engine = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .channel_capacity(2)
        .build();

    let mut stream = engine.subscribe_stream();
    engine.clone().start();
    fixture.wait_for_sse_connections(1).await;

    // First event is SyncStarted
    let first = stream.recv().await.unwrap();
    assert!(matches!(first, SyncEvent::SyncStarted { .. }));

    // Send multiple events rapidly while consumer does not read
    for i in 501..=510 {
        fixture.push_event(&payment_record(
            i,
            "GSENDER",
            ACCOUNT,
            Some("ECHO"),
            "1.0000000",
        ));
    }

    // Give time for engine to process records and broadcast to channel
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Slow consumer wakes up and calls recv()
    // Should receive GapDetected event with missed count > 0
    let mut received_gap = false;
    let mut gap_missed = 0;
    for _ in 0..10 {
        if let Ok(event) = stream.recv().await {
            if let SyncEvent::GapDetected { missed_count } = event {
                received_gap = true;
                gap_missed = missed_count;
                break;
            }
        }
    }

    assert!(received_gap, "expected consumer to receive GapDetected event");
    assert!(gap_missed > 0, "expected missed count > 0");

    let snapshot = engine.metrics();
    assert!(snapshot.lag_events >= 1, "expected lag_events >= 1");
    assert!(snapshot.events_lost >= 1, "expected events_lost >= 1");

    engine.stop();
    engine.stopped().await;
}
