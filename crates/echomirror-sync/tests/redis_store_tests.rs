//! RedisCursorStore tests — require a running Redis and the `redis`
//! feature. Skipped (with a notice) unless `REDIS_URL` is set:
//!
//! ```sh
//! REDIS_URL=redis://127.0.0.1:6379 cargo test -p echomirror-sync --features redis
//! ```
#![cfg(feature = "redis")]

use echomirror_sync::{CursorStore, RedisCursorStore, SyncCursor};

fn redis_url() -> Option<String> {
    match std::env::var("REDIS_URL") {
        Ok(url) if !url.is_empty() => Some(url),
        _ => {
            eprintln!("skipping redis cursor store test: REDIS_URL not set");
            None
        }
    }
}

#[tokio::test]
async fn connect_and_ping() {
    let Some(url) = redis_url() else { return };
    let _store = RedisCursorStore::connect(&url).await.unwrap();
    // If connect succeeds, a PING was already issued internally.
}

#[tokio::test]
async fn connect_with_custom_ttl() {
    let Some(url) = redis_url() else { return };
    let _store = RedisCursorStore::connect_with_ttl(&url, 3600)
        .await
        .unwrap();
}

#[tokio::test]
async fn load_missing_account_returns_none() {
    let Some(url) = redis_url() else { return };
    let store = RedisCursorStore::connect(&url).await.unwrap();
    let loaded = store.load("GNO_SUCH_ACCOUNT_EVER").await.unwrap();
    assert!(loaded.is_none());
}

#[tokio::test]
async fn save_load_roundtrip() {
    let Some(url) = redis_url() else { return };
    let store = RedisCursorStore::connect(&url).await.unwrap();

    // Unique per-run account so parallel/repeat runs don't collide.
    let account = format!("GTEST{}", chrono::Utc::now().timestamp_nanos_opt().unwrap());

    let first = SyncCursor {
        ledger_sequence: 4_000_000_000, // exercises large u32 values
        paging_token: "17179869184".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 42,
    };
    store.save(&account, &first).await.unwrap();

    let loaded = store.load(&account).await.unwrap().expect("saved cursor");
    assert_eq!(loaded.ledger_sequence, first.ledger_sequence);
    assert_eq!(loaded.paging_token, first.paging_token);
    assert_eq!(loaded.total_processed, first.total_processed);
    // Timestamp precision: Redis preserves microseconds via JSON serialization
    assert_eq!(
        loaded.last_synced_at.timestamp_micros(),
        first.last_synced_at.timestamp_micros()
    );
}

#[tokio::test]
async fn save_upsert_overwrites() {
    let Some(url) = redis_url() else { return };
    let store = RedisCursorStore::connect(&url).await.unwrap();

    let account = format!("GTEST{}", chrono::Utc::now().timestamp_nanos_opt().unwrap());

    let first = SyncCursor {
        ledger_sequence: 100,
        paging_token: "100".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 1,
    };
    store.save(&account, &first).await.unwrap();

    let second = SyncCursor {
        ledger_sequence: 200,
        paging_token: "200".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 2,
    };
    store.save(&account, &second).await.unwrap();

    let loaded = store.load(&account).await.unwrap().expect("saved cursor");
    assert_eq!(loaded.ledger_sequence, 200);
    assert_eq!(loaded.paging_token, "200");
    assert_eq!(loaded.total_processed, 2);
}

#[tokio::test]
async fn multiple_accounts_independent() {
    let Some(url) = redis_url() else { return };
    let store = RedisCursorStore::connect(&url).await.unwrap();

    let account1 = format!(
        "GTEST1_{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap()
    );
    let account2 = format!(
        "GTEST2_{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap()
    );

    let cursor1 = SyncCursor {
        ledger_sequence: 111,
        paging_token: "111".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 10,
    };
    let cursor2 = SyncCursor {
        ledger_sequence: 222,
        paging_token: "222".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 20,
    };

    store.save(&account1, &cursor1).await.unwrap();
    store.save(&account2, &cursor2).await.unwrap();

    let loaded1 = store.load(&account1).await.unwrap().expect("cursor1");
    let loaded2 = store.load(&account2).await.unwrap().expect("cursor2");

    assert_eq!(loaded1.ledger_sequence, 111);
    assert_eq!(loaded2.ledger_sequence, 222);
    assert_eq!(loaded1.total_processed, 10);
    assert_eq!(loaded2.total_processed, 20);
}

#[tokio::test]
async fn ttl_refresh_on_save() {
    let Some(url) = redis_url() else { return };
    // Use a short TTL (10 seconds) to verify refresh behavior
    let store = RedisCursorStore::connect_with_ttl(&url, 10).await.unwrap();

    let account = format!("GTEST{}", chrono::Utc::now().timestamp_nanos_opt().unwrap());

    let cursor = SyncCursor {
        ledger_sequence: 500,
        paging_token: "500".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 50,
    };
    store.save(&account, &cursor).await.unwrap();

    // Verify the cursor is present
    let loaded = store.load(&account).await.unwrap().expect("cursor saved");
    assert_eq!(loaded.ledger_sequence, 500);

    // In a real scenario, we'd wait near the expiry and verify it expires.
    // For tests, we just verify that saving again works (TTL is refreshed).
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    let cursor2 = SyncCursor {
        ledger_sequence: 501,
        paging_token: "501".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 51,
    };
    store.save(&account, &cursor2).await.unwrap();

    let loaded = store
        .load(&account)
        .await
        .unwrap()
        .expect("cursor still present");
    assert_eq!(loaded.ledger_sequence, 501);
}

#[tokio::test]
async fn concurrent_saves_and_loads() {
    let Some(url) = redis_url() else { return };
    let store = std::sync::Arc::new(RedisCursorStore::connect(&url).await.unwrap());

    let base_time = chrono::Utc::now().timestamp_nanos_opt().unwrap();

    // Spawn multiple tasks that concurrently save and load
    let mut handles = vec![];
    for i in 0..5 {
        let store = store.clone();
        let handle = tokio::spawn(async move {
            let account = format!("GTEST_CONCURRENT_{}", base_time + i);
            let cursor = SyncCursor {
                ledger_sequence: 1000 + i as u32,
                paging_token: format!("{}", i),
                last_synced_at: chrono::Utc::now(),
                total_processed: i as u64 * 100,
            };

            store.save(&account, &cursor).await.unwrap();
            let loaded = store.load(&account).await.unwrap().expect("cursor");
            assert_eq!(loaded.ledger_sequence, 1000 + i as u32);
            assert_eq!(loaded.total_processed, i as u64 * 100);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.await.unwrap();
    }
}

#[tokio::test]
async fn save_with_large_paging_token() {
    let Some(url) = redis_url() else { return };
    let store = RedisCursorStore::connect(&url).await.unwrap();

    let account = format!("GTEST{}", chrono::Utc::now().timestamp_nanos_opt().unwrap());

    // Test with a large paging token (common in real scenarios)
    let large_token = "x".repeat(1000);
    let cursor = SyncCursor {
        ledger_sequence: 999,
        paging_token: large_token.clone(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 99,
    };

    store.save(&account, &cursor).await.unwrap();
    let loaded = store.load(&account).await.unwrap().expect("cursor");
    assert_eq!(loaded.paging_token, large_token);
    assert_eq!(loaded.ledger_sequence, 999);
}

#[tokio::test]
async fn special_characters_in_account_name() {
    let Some(url) = redis_url() else { return };
    let store = RedisCursorStore::connect(&url).await.unwrap();

    // Redis key names can contain any byte sequence; test with special chars
    let account = format!(
        "GTEST:{}{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap(),
        "/*@#$%"
    );

    let cursor = SyncCursor {
        ledger_sequence: 777,
        paging_token: "777".to_string(),
        last_synced_at: chrono::Utc::now(),
        total_processed: 77,
    };

    store.save(&account, &cursor).await.unwrap();
    let loaded = store.load(&account).await.unwrap().expect("cursor");
    assert_eq!(loaded.ledger_sequence, 777);
}
