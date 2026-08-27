//! Throughput/latency benchmarks for `echomirror-sync`'s SSE ingest pipeline
//! (Horizon SSE → filter → cursor persist → broadcast, per `engine.rs`).
//!
//! Two groups, deliberately separated so a regression can be localized:
//!
//! - `parse_filter` — pure CPU cost of `map_payment` + `SyncFilter::matches`
//!   on already-received JSON, no I/O at all. This isolates the
//!   filtering/mapping stage `#131` calls out as one of the two candidate
//!   bottlenecks.
//! - `end_to_end_pipeline` — a real `SyncEngine` wired to the same
//!   `HorizonFixture` mock Horizon the integration tests use
//!   (`tests/common/horizon_fixture.rs`), pushing a burst of SSE frames over
//!   a real loopback TCP connection and timing how long the subscriber takes
//!   to receive every resulting `TransactionDetected` event. This is the
//!   other candidate bottleneck (SSE parsing + the broadcast channel) and,
//!   combined with `parse_filter`, is what separates "filtering is the
//!   bottleneck" from "the transport/broadcast layer is the bottleneck" —
//!   see `benches/BASELINE.md` for the resulting breakdown.
//!
//! Cursor persistence latency is benchmarked separately in
//! `cursor_store_bench.rs` (it varies by `CursorStore` backend, which this
//! file's scenarios don't exercise — the fixture's default engine uses
//! `InMemoryCursorStore`).
//!
//! Run: `cargo bench -p echomirror-sync`. See `benches/BASELINE.md` for the
//! documented throughput/latency baseline this suite establishes and the CI
//! job (`.github/workflows/sync-bench.yml`) that guards it.

#[path = "support.rs"]
mod support;

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use echomirror_core::SyncEvent;
use echomirror_stellar::HorizonPaymentRecord;
use echomirror_sync::filter::SyncRecord;
use echomirror_sync::record::map_payment;
use echomirror_sync::{SyncEngine, SyncFilter};
use std::time::{Duration, Instant};
use support::common::{
    horizon_fixture::HorizonFixture, next_event_matching, payment_record, test_client,
};
use tokio::runtime::Runtime;

const WATCHED_ACCOUNT: &str = "GBENCHWATCHEDACCOUNT00000000000000000000000000000";
const SENDER: &str = "GBENCHSENDERACCOUNT000000000000000000000000000000";

fn synthetic_record_json(token: u64) -> String {
    payment_record(token, SENDER, WATCHED_ACCOUNT, None, "12.5000000").to_string()
}

fn parse_filter_benches(c: &mut Criterion) {
    let mut group = c.benchmark_group("parse_filter");
    let filter = SyncFilter::new().min_amount(1.0);

    for batch in [100usize, 1_000, 10_000] {
        let records: Vec<String> = (0..batch as u64).map(synthetic_record_json).collect();

        group.throughput(Throughput::Elements(batch as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(batch),
            &records,
            |b, records| {
                b.iter(|| {
                    let mut matched = 0u64;
                    for json in records {
                        let record: HorizonPaymentRecord =
                            serde_json::from_str(json).expect("synthetic record parses");
                        if let Ok(echomirror_sync::record::MapOutcome::Mapped(mapped)) =
                            map_payment(&record, WATCHED_ACCOUNT)
                        {
                            let rec: &SyncRecord = &mapped.sync_record;
                            if filter.matches(rec) {
                                matched += 1;
                            }
                        }
                    }
                    black_box(matched)
                });
            },
        );
    }
    group.finish();
}

/// Push `n` synthetic payment events through a live `SyncEngine` (backed by
/// the `HorizonFixture` mock Horizon) and return how long it took the
/// subscriber to receive all `n` resulting `TransactionDetected` events.
/// Setup/teardown (fixture + engine startup, shutdown) is excluded from the
/// timed span — see the `iter_custom` call site.
async fn run_pipeline(n: u64) -> Duration {
    let fixture = HorizonFixture::start().await;
    let client = test_client(&fixture.base_url());
    let engine = SyncEngine::builder(&client).watch(WATCHED_ACCOUNT).build();
    let mut rx = engine.subscribe();
    engine.clone().start();
    fixture.wait_for_sse_connections(1).await;

    let started = Instant::now();
    for i in 0..n {
        let record = payment_record(1_000_000 + i, SENDER, WATCHED_ACCOUNT, None, "12.5000000");
        fixture.push_event(&record);
    }

    let mut received = 0u64;
    while received < n {
        next_event_matching(&mut rx, |e| {
            matches!(e, SyncEvent::TransactionDetected { .. })
        })
        .await;
        received += 1;
    }
    let elapsed = started.elapsed();

    engine.stop();
    engine.stopped().await;
    elapsed
}

fn end_to_end_benches(c: &mut Criterion) {
    let rt = Runtime::new().expect("tokio runtime");
    let mut group = c.benchmark_group("end_to_end_pipeline");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(15));

    for batch in [100u64, 500] {
        group.throughput(Throughput::Elements(batch));
        group.bench_with_input(BenchmarkId::from_parameter(batch), &batch, |b, &batch| {
            b.to_async(&rt).iter_custom(|iters| async move {
                let mut total = Duration::ZERO;
                for _ in 0..iters {
                    total += run_pipeline(batch).await;
                }
                total
            });
        });
    }
    group.finish();
}

criterion_group!(benches, parse_filter_benches, end_to_end_benches);
criterion_main!(benches);
