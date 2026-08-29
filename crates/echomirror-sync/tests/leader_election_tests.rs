//! Leader election: exactly one instance streams a watched account at a
//! time, and a standby that never wins the lease processes nothing.

mod common;

use common::horizon_fixture::HorizonFixture;
use common::{payment_record, test_client};
use echomirror_core::SyncEvent;
use echomirror_sync::{LeaderElector, SingleProcessElector, SyncEngine};
use std::sync::Arc;
use std::time::Duration;

const ACCOUNT: &str = "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6";

/// Poll `pred` up to 5s — keeps hung assertions from stalling CI.
async fn wait_until(mut pred: impl FnMut() -> bool) {
    for _ in 0..100 {
        if pred() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("condition not met within 5s");
}

#[tokio::test(flavor = "multi_thread")]
async fn only_one_of_two_instances_streams_the_shared_account() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let elector: Arc<dyn LeaderElector> = Arc::new(SingleProcessElector::new());

    let engine_a = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .leader_elector(elector.clone())
        .holder_id("instance-a")
        .lease_retry_backoff(Duration::from_millis(20), Duration::from_millis(100))
        .build();
    let engine_b = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .leader_elector(elector.clone())
        .holder_id("instance-b")
        .lease_retry_backoff(Duration::from_millis(20), Duration::from_millis(100))
        .build();

    let mut events_a = engine_a.subscribe();
    let mut events_b = engine_b.subscribe();
    engine_a.clone().start();
    engine_b.clone().start();

    // Exactly one SSE connection ever opens, no matter which instance won.
    fixture.wait_for_sse_connections(1).await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(fixture.sse_connection_count(), 1);

    let a_leads = engine_a.metrics().is_leader(ACCOUNT);
    let b_leads = engine_b.metrics().is_leader(ACCOUNT);
    assert_ne!(a_leads, b_leads, "exactly one instance must hold the lease");

    fixture.push_event(&payment_record(
        901,
        "GSENDER",
        ACCOUNT,
        Some("ECHO"),
        "1.0000000",
    ));

    let (leader_events, follower_events, follower_metrics) = if a_leads {
        (&mut events_a, &mut events_b, &engine_b)
    } else {
        (&mut events_b, &mut events_a, &engine_a)
    };

    let got = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(SyncEvent::TransactionDetected { tx }) = leader_events.recv().await {
                return tx;
            }
        }
    })
    .await
    .expect("leader must process the event");
    assert_eq!(got.id, "901");

    // The standby's broadcast channel must carry nothing at all — it never
    // entered the streaming path in the first place.
    assert!(
        tokio::time::timeout(Duration::from_millis(200), follower_events.recv())
            .await
            .is_err(),
        "standby must not emit any sync events"
    );
    assert_eq!(follower_metrics.metrics().events_emitted, 0);

    engine_a.stop();
    engine_b.stop();
    engine_a.stopped().await;
    engine_b.stopped().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn standby_that_never_becomes_leader_processes_no_events() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let elector: Arc<dyn LeaderElector> = Arc::new(SingleProcessElector::new());

    // Seed the lease for a third party so instance-b never wins it.
    elector
        .try_acquire(ACCOUNT, "external-holder", Duration::from_secs(60))
        .await
        .unwrap();

    let engine_b = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .leader_elector(elector.clone())
        .holder_id("instance-b")
        .lease_retry_backoff(Duration::from_millis(20), Duration::from_millis(50))
        .build();
    let mut events_b = engine_b.subscribe();
    engine_b.clone().start();

    // Give it several retry cycles to (wrongly) start streaming if it were
    // going to.
    tokio::time::sleep(Duration::from_millis(300)).await;

    assert_eq!(fixture.sse_connection_count(), 0);
    assert!(!engine_b.metrics().is_leader(ACCOUNT));
    assert_eq!(engine_b.metrics().events_emitted, 0);
    assert!(engine_b.metrics().leases_denied >= 1);
    assert!(
        tokio::time::timeout(Duration::from_millis(50), events_b.recv())
            .await
            .is_err(),
        "a standby that never won the lease must emit no sync events at all"
    );

    engine_b.stop();
    engine_b.stopped().await;
}

#[cfg(feature = "test-util")]
#[tokio::test(flavor = "multi_thread")]
async fn follower_takes_over_after_leader_crashes_mid_stream() {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let elector: Arc<dyn LeaderElector> = Arc::new(SingleProcessElector::new());

    let lease_ttl = Duration::from_millis(150);
    let renew_interval = Duration::from_millis(40);

    let engine_a = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .leader_elector(elector.clone())
        .holder_id("instance-a")
        .lease(lease_ttl, renew_interval)
        .lease_retry_backoff(Duration::from_millis(20), Duration::from_millis(50))
        .build();
    let engine_b = SyncEngine::builder(&client)
        .watch(ACCOUNT)
        .leader_elector(elector.clone())
        .holder_id("instance-b")
        .lease(lease_ttl, renew_interval)
        .lease_retry_backoff(Duration::from_millis(20), Duration::from_millis(50))
        .build();

    engine_a.clone().start();
    engine_b.clone().start();

    // A wins the race and starts streaming.
    wait_until(|| engine_a.metrics().is_leader(ACCOUNT)).await;
    fixture.wait_for_sse_connections(1).await;
    assert!(!engine_b.metrics().is_leader(ACCOUNT));

    let mut events_b = engine_b.subscribe();

    // Simulate A's process dying: tasks are aborted directly, with no
    // cooperative cancellation and therefore no lease release.
    engine_a.crash_for_test();
    // The mock fixture only notices a client-side disappearance the next
    // time it *writes* to that connection — it never reads the socket. Tell
    // it explicitly so `sse_connection_count()` below reflects only B's
    // (real, freshly-opened) connection rather than A's zombie entry.
    fixture.drop_connections();

    // B must not need a clean handoff — only the lease's natural expiry.
    wait_until(|| engine_b.metrics().is_leader(ACCOUNT)).await;
    fixture.wait_for_sse_connections(1).await;
    assert_eq!(
        fixture.sse_connection_count(),
        1,
        "the crashed leader's connection must be gone and only B's remains"
    );

    fixture.push_event(&payment_record(
        1001,
        "GSENDER",
        ACCOUNT,
        Some("ECHO"),
        "4.0000000",
    ));
    let got = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(SyncEvent::TransactionDetected { tx }) = events_b.recv().await {
                return tx;
            }
        }
    })
    .await
    .expect("standby must take over and process new events");
    assert_eq!(got.id, "1001");

    assert!(engine_b.metrics().leases_acquired >= 1);

    engine_b.stop();
    engine_b.stopped().await;
}
