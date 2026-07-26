//! Forced disconnect, gap backfill on reconnect, and heartbeat liveness.

mod common;

use common::horizon_fixture::HorizonFixture;
use common::{next_event_matching, payment_record, test_client};
use echomirror_core::SyncEvent;
use echomirror_sync::{CursorStore, InMemoryCursorStore, SyncEngine};
use std::sync::Arc;
use std::time::Duration;

const ACCOUNT: &str = "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6";

#[tokio::test(flavor = "multi_thread")]
async fn disconnect_backfills_gap_and_resumes_without_duplicates() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let store = Arc::new(InMemoryCursorStore::new());

    let engine = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .cursor_store(store.clone())
        .reconnect_backoff(Duration::from_millis(10), Duration::from_millis(50))
        .build();
    let mut events = engine.subscribe();
    engine.clone().start();
    fixture.wait_for_sse_connections(1).await;

    // A arrives live.
    fixture.push_event(&payment_record(
        501,
        "GSENDER",
        ACCOUNT,
        Some("ECHO"),
        "1.0000000",
    ));
    let SyncEvent::TransactionDetected { tx } = next_event_matching(&mut events, |e| {
        matches!(e, SyncEvent::TransactionDetected { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(tx.id, "501");

    // B lands on-chain *while we are disconnected* — it exists only in the
    // paginated API, keyed by the cursor the engine must resume from.
    fixture.set_page(
        "501",
        vec![payment_record(
            502,
            "GSENDER",
            ACCOUNT,
            Some("ECHO"),
            "2.0000000",
        )],
    );

    // Force the drop.
    fixture.drop_connections();
    next_event_matching(&mut events, |e| matches!(e, SyncEvent::SyncPaused { .. })).await;

    // Reconnect: backfill must deliver B, then the live stream delivers C.
    let SyncEvent::TransactionDetected { tx } = next_event_matching(&mut events, |e| {
        matches!(e, SyncEvent::TransactionDetected { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(tx.id, "502", "gap record must arrive via backfill");

    fixture.wait_for_sse_connections(1).await;
    fixture.push_event(&payment_record(
        503,
        "GSENDER",
        ACCOUNT,
        Some("ECHO"),
        "3.0000000",
    ));
    let SyncEvent::TransactionDetected { tx } = next_event_matching(&mut events, |e| {
        matches!(e, SyncEvent::TransactionDetected { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(tx.id, "503");

    // Reconnect accounting and resume positions.
    let snapshot = engine.metrics();
    assert_eq!(snapshot.reconnects, 1);
    assert_eq!(snapshot.events_emitted, 3);
    assert_eq!(snapshot.events_deduped, 0);

    let requests = fixture.requests();
    assert!(
        requests
            .iter()
            .any(|r| r.starts_with("GET") && r.contains("cursor=501")),
        "backfill must resume from the persisted cursor, got {requests:?}"
    );
    assert!(
        requests
            .iter()
            .any(|r| r.starts_with("SSE") && r.contains("cursor=502")),
        "live stream must re-attach after the backfilled record, got {requests:?}"
    );

    let cursor = store.load(ACCOUNT).await.unwrap().expect("cursor saved");
    assert_eq!(cursor.paging_token, "503");
    assert_eq!(cursor.total_processed, 3);

    engine.stop();
    engine.stopped().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn backfill_replayed_by_stream_is_deduped() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let store = Arc::new(InMemoryCursorStore::new());

    // Pre-seed the cursor so the engine starts with a backfill.
    store
        .save(ACCOUNT, &echomirror_sync::SyncCursor::from_ledger(600))
        .await
        .unwrap();
    let gap_record = payment_record(601, "GSENDER", ACCOUNT, Some("ECHO"), "1.0000000");
    fixture.set_page("600", vec![gap_record.clone()]);

    let engine = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .cursor_store(store.clone())
        .reconnect_backoff(Duration::from_millis(10), Duration::from_millis(50))
        .build();
    let mut events = engine.subscribe();
    engine.clone().start();

    // Backfill emits the gap record.
    let SyncEvent::TransactionDetected { tx } = next_event_matching(&mut events, |e| {
        matches!(e, SyncEvent::TransactionDetected { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(tx.id, "601");

    // The live stream replays the same record (as Horizon can after a
    // cursor race) plus a new one — the replay must be dropped.
    fixture.wait_for_sse_connections(1).await;
    fixture.push_event(&gap_record);
    fixture.push_event(&payment_record(
        602,
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
    assert_eq!(tx.id, "602", "replayed 601 must be deduped");
    assert_eq!(engine.metrics().events_deduped, 1);

    engine.stop();
    engine.stopped().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn multi_page_backfill_walks_all_pages_before_attaching() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let store = Arc::new(InMemoryCursorStore::new());

    store
        .save(ACCOUNT, &echomirror_sync::SyncCursor::from_ledger(700))
        .await
        .unwrap();

    // Page size 2: full page [701, 702] → next page [703] (short → done).
    fixture.set_page(
        "700",
        vec![
            payment_record(701, "GSENDER", ACCOUNT, Some("ECHO"), "1.0000000"),
            payment_record(702, "GSENDER", ACCOUNT, Some("ECHO"), "2.0000000"),
        ],
    );
    fixture.set_page(
        "702",
        vec![payment_record(
            703,
            "GSENDER",
            ACCOUNT,
            Some("ECHO"),
            "3.0000000",
        )],
    );

    let engine = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .cursor_store(store.clone())
        .backfill_page_size(2)
        .build();
    let mut events = engine.subscribe();
    engine.clone().start();

    for expected in ["701", "702", "703"] {
        let SyncEvent::TransactionDetected { tx } = next_event_matching(&mut events, |e| {
            matches!(e, SyncEvent::TransactionDetected { .. })
        })
        .await
        else {
            unreachable!()
        };
        assert_eq!(tx.id, expected);
    }

    fixture.wait_for_sse_connections(1).await;
    let requests = fixture.requests();
    assert!(
        requests
            .iter()
            .any(|r| r.starts_with("SSE") && r.contains("cursor=703")),
        "SSE must attach only after the full backfill, got {requests:?}"
    );

    let snapshot = engine.metrics();
    assert_eq!(snapshot.backfill_records, 3);
    assert!(snapshot.backfill_pages >= 2);

    let cursor = store.load(ACCOUNT).await.unwrap().expect("cursor saved");
    assert_eq!(cursor.paging_token, "703");

    engine.stop();
    engine.stopped().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn heartbeats_keep_an_otherwise_quiet_stream_alive() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());

    let engine = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .idle_timeout(Duration::from_millis(500))
        .reconnect_backoff(Duration::from_millis(10), Duration::from_millis(50))
        .build();
    engine.clone().start();
    fixture.wait_for_sse_connections(1).await;

    // Heartbeat every 200ms for 1.5s — well past the 500ms idle timeout.
    for _ in 0..7 {
        fixture.push_heartbeat();
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    assert_eq!(
        engine.metrics().reconnects,
        0,
        "heartbeats must reset the idle watchdog"
    );

    engine.stop();
    engine.stopped().await;
}
