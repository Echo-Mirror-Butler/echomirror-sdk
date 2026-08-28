//! Cursor persistence latency, per `CursorStore` backend — see
//! `benches/BASELINE.md` for the documented baseline.
//!
//! `InMemoryCursorStore` always runs (a useful floor: it's what the pipeline
//! benchmark in `pipeline_bench.rs` uses, so its latency should be near zero
//! relative to end-to-end numbers there). `PgCursorStore` only runs with the
//! `postgres` feature enabled *and* `DATABASE_URL` set, mirroring the
//! self-skip convention in `tests/postgres_store_tests.rs`. `RedisCursorStore`
//! only runs with the `redis` feature enabled *and* `REDIS_URL` set.
//!
//! ```sh
//! DATABASE_URL=postgres://postgres:postgres@localhost:5432/echomirror_test \
//!     cargo bench -p echomirror-sync --features postgres
//!
//! REDIS_URL=redis://127.0.0.1:6379 \
//!     cargo bench -p echomirror-sync --features redis
//! ```

use criterion::{criterion_group, criterion_main, Criterion};
use echomirror_sync::{CursorStore, InMemoryCursorStore, SyncCursor};
use tokio::runtime::Runtime;

fn sample_cursor() -> SyncCursor {
    SyncCursor {
        ledger_sequence: 4_242_424,
        paging_token: "18213191787053056".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 1_000,
    }
}

fn bench_in_memory(c: &mut Criterion) {
    let rt = Runtime::new().expect("tokio runtime");
    let store = InMemoryCursorStore::new();
    let cursor = sample_cursor();

    c.bench_function("cursor_store_in_memory_save", |b| {
        b.to_async(&rt)
            .iter(|| async { store.save("GBENCH_CURSOR", &cursor).await.unwrap() });
    });
}

#[cfg(feature = "postgres")]
fn bench_postgres(c: &mut Criterion) {
    use echomirror_sync::PgCursorStore;

    let Ok(url) = std::env::var("DATABASE_URL") else {
        eprintln!("skipping cursor_store_postgres_save: DATABASE_URL not set");
        return;
    };
    let rt = Runtime::new().expect("tokio runtime");
    let store = match rt.block_on(PgCursorStore::connect(&url)) {
        Ok(store) => store,
        Err(e) => {
            eprintln!("skipping cursor_store_postgres_save: connect failed: {e}");
            return;
        }
    };
    let cursor = sample_cursor();

    c.bench_function("cursor_store_postgres_save", |b| {
        b.to_async(&rt)
            .iter(|| async { store.save("GBENCH_CURSOR_PG", &cursor).await.unwrap() });
    });
}

#[cfg(feature = "redis")]
fn bench_redis(c: &mut Criterion) {
    use echomirror_sync::RedisCursorStore;

    let Ok(url) = std::env::var("REDIS_URL") else {
        eprintln!("skipping cursor_store_redis_save: REDIS_URL not set");
        return;
    };
    let rt = Runtime::new().expect("tokio runtime");
    let store = match rt.block_on(RedisCursorStore::connect(&url)) {
        Ok(store) => store,
        Err(e) => {
            eprintln!("skipping cursor_store_redis_save: connect failed: {e}");
            return;
        }
    };
    let cursor = sample_cursor();

    c.bench_function("cursor_store_redis_save", |b| {
        b.to_async(&rt)
            .iter(|| async { store.save("GBENCH_CURSOR_REDIS", &cursor).await.unwrap() });
    });
}

#[cfg(all(feature = "postgres", feature = "redis"))]
criterion_group!(cursor_benches, bench_in_memory, bench_postgres, bench_redis);
#[cfg(all(feature = "postgres", not(feature = "redis")))]
criterion_group!(cursor_benches, bench_in_memory, bench_postgres);
#[cfg(all(not(feature = "postgres"), feature = "redis"))]
criterion_group!(cursor_benches, bench_in_memory, bench_redis);
#[cfg(all(not(feature = "postgres"), not(feature = "redis")))]
criterion_group!(cursor_benches, bench_in_memory);

criterion_main!(cursor_benches);
