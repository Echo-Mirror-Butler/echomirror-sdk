//! PgCursorStore tests — require a running PostgreSQL and the `postgres`
//! feature. Skipped (with a notice) unless `DATABASE_URL` is set:
//!
//! ```sh
//! DATABASE_URL=postgres://postgres:postgres@localhost:5432/echomirror_test \
//!     cargo test -p echomirror-sync --features postgres
//! ```
#![cfg(feature = "postgres")]

use echomirror_sync::{CursorStore, PgCursorStore, SyncCursor};

fn database_url() -> Option<String> {
    match std::env::var("DATABASE_URL") {
        Ok(url) if !url.is_empty() => Some(url),
        _ => {
            eprintln!("skipping postgres cursor store test: DATABASE_URL not set");
            None
        }
    }
}

#[tokio::test]
async fn migrate_is_idempotent() {
    let Some(url) = database_url() else { return };
    let store = PgCursorStore::connect(&url).await.unwrap();
    // connect() already migrated once; running again must be a no-op.
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
}

#[tokio::test]
async fn load_missing_account_returns_none() {
    let Some(url) = database_url() else { return };
    let store = PgCursorStore::connect(&url).await.unwrap();
    let loaded = store.load("GNO_SUCH_ACCOUNT_EVER").await.unwrap();
    assert!(loaded.is_none());
}

#[tokio::test]
async fn save_load_roundtrip_and_upsert_overwrite() {
    let Some(url) = database_url() else { return };
    let store = PgCursorStore::connect(&url).await.unwrap();

    // Unique per-run account so parallel/repeat runs don't collide.
    let account = format!("GTEST{}", chrono::Utc::now().timestamp_nanos_opt().unwrap());

    let first = SyncCursor {
        ledger_sequence: 4_000_000_000, // exercises the >i32 BIGINT range
        paging_token: "17179869184".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 42,
    };
    store.save(&account, &first).await.unwrap();

    let loaded = store.load(&account).await.unwrap().expect("saved cursor");
    assert_eq!(loaded.ledger_sequence, first.ledger_sequence);
    assert_eq!(loaded.paging_token, first.paging_token);
    assert_eq!(loaded.total_processed, first.total_processed);
    assert_eq!(
        loaded.last_synced_at.timestamp_micros(),
        first.last_synced_at.timestamp_micros()
    );

    // Upsert overwrites in place.
    let second = SyncCursor {
        ledger_sequence: 4_000_000_001,
        paging_token: "17179869185".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 43,
    };
    store.save(&account, &second).await.unwrap();
    let loaded = store.load(&account).await.unwrap().expect("saved cursor");
    assert_eq!(loaded.paging_token, "17179869185");
    assert_eq!(loaded.total_processed, 43);

    sqlx::query("DELETE FROM echomirror_sync_cursors WHERE account = $1")
        .bind(&account)
        .execute(store.pool())
        .await
        .unwrap();
}

#[tokio::test]
async fn shared_pool_constructor_works() {
    let Some(url) = database_url() else { return };
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .unwrap();
    let store = PgCursorStore::new(pool);
    store.migrate().await.unwrap();
    assert!(store.load("GNOBODY").await.unwrap().is_none());
}
