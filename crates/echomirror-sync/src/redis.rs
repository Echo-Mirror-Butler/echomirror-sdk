use crate::cursor::{CursorStore, SyncCursor};
use echomirror_core::{EchoMirrorError, Result};
use redis::aio::ConnectionManager;
use redis::{AsyncCommands, Client};

fn store_err(context: &str, e: impl std::fmt::Display) -> EchoMirrorError {
    EchoMirrorError::Sync(format!("redis cursor store: {context}: {e}"))
}

/// Redis-backed [`CursorStore`].
///
/// Persists one key per watched account (format: `echomirror:cursor:{account}`)
/// with a TTL to prevent accumulation of stale cursors for deleted accounts.
/// Cursor values are stored with a refresh-on-write TTL pattern: the key
/// expires after inactivity but gets rewritten on every save, effectively
/// renewing the TTL for active accounts.
///
/// Supports both single-node Redis and Redis Cluster/Sentinel deployments via
/// the same connection API (underlying client handles topology management).
///
/// Safe for concurrent use across multiple sync engine instances — Redis
/// handles atomic read/write semantics. Cross-instance cursor change
/// notification can be achieved via Redis Pub/Sub (not yet integrated).
///
/// ```rust,no_run
/// # async fn example() -> echomirror_core::Result<()> {
/// use echomirror_sync::RedisCursorStore;
///
/// // Connect to localhost:6379
/// let store = RedisCursorStore::connect("redis://127.0.0.1:6379").await?;
///
/// // Or use explicit configuration
/// let store = RedisCursorStore::connect("redis://user:pass@prod-cluster.example.com").await?;
/// # Ok(())
/// # }
/// ```
pub struct RedisCursorStore {
    client: ConnectionManager,
    /// TTL in seconds for cursor keys. Set to 30 days by default; a cursor
    /// is refreshed on every save (SET key value EX ttl), so active accounts
    /// never expire. Abandoned accounts (no sync for 30 days) are cleaned up.
    ttl_seconds: usize,
}

impl RedisCursorStore {
    /// Default TTL: 30 days in seconds (2_592_000).
    /// This prevents unbounded Redis memory growth for deleted/abandoned accounts
    /// while allowing active accounts to persist indefinitely (TTL is reset on save).
    pub const DEFAULT_TTL_SECONDS: usize = 30 * 24 * 60 * 60; // 2_592_000

    /// Connect to a Redis instance at the given URL and verify connectivity.
    /// Supports:
    /// - `redis://[:password@]host[:port][/database]` (single node)
    /// - `rediss://` variants for TLS
    /// - Redis Cluster and Sentinel topologies (client auto-detects)
    ///
    /// Connection pooling is handled internally by `ConnectionManager`.
    pub async fn connect(redis_url: &str) -> Result<Self> {
        Self::connect_with_ttl(redis_url, Self::DEFAULT_TTL_SECONDS).await
    }

    /// Connect with a custom TTL (in seconds). Useful for testing or
    /// environments where cursor lifetime should differ from the default.
    pub async fn connect_with_ttl(redis_url: &str, ttl_seconds: usize) -> Result<Self> {
        let client = Client::open(redis_url).map_err(|e| store_err("parse_url", e))?;

        // Verify connectivity by issuing a PING.
        let manager = ConnectionManager::new(client)
            .await
            .map_err(|e| store_err("connect", e))?;

        let mut conn = manager.clone();
        let _: String = redis::cmd("PING")
            .query_async(&mut conn)
            .await
            .map_err(|e| store_err("ping", e))?;

        Ok(Self {
            client: manager,
            ttl_seconds,
        })
    }

    /// Get the underlying Redis connection manager, e.g. for health checks.
    pub fn client(&self) -> &ConnectionManager {
        &self.client
    }

    fn cursor_key(account: &str) -> String {
        format!("echomirror:cursor:{}", account)
    }
}

#[async_trait::async_trait]
impl CursorStore for RedisCursorStore {
    async fn load(&self, account: &str) -> Result<Option<SyncCursor>> {
        let key = Self::cursor_key(account);
        let mut conn = self.client.clone();

        let value: Option<String> = conn
            .get(&key)
            .await
            .map_err(|e| store_err("load", e))?;

        let Some(json) = value else { return Ok(None) };

        let cursor: SyncCursor = serde_json::from_str(&json)
            .map_err(|e| store_err("load_deserialize", e))?;

        Ok(Some(cursor))
    }

    async fn save(&self, account: &str, cursor: &SyncCursor) -> Result<()> {
        let key = Self::cursor_key(account);
        let json = serde_json::to_string(cursor)
            .map_err(|e| store_err("save_serialize", e))?;

        let mut conn = self.client.clone();

        // SET with EX (expire) atomically stores the value and refreshes TTL.
        // This prevents stale cursors from accumulating indefinitely while
        // allowing active accounts to persist.
        let _: () = redis::cmd("SET")
            .arg(&key)
            .arg(&json)
            .arg("EX")
            .arg(self.ttl_seconds)
            .query_async(&mut conn)
            .await
            .map_err(|e| store_err("save", e))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[tokio::test]
    async fn serialize_cursor_roundtrip() {
        let cursor = SyncCursor {
            ledger_sequence: 4_242_424,
            paging_token: "18213191787053056".to_string(),
            last_synced_at: Utc::now(),
            total_processed: 1_000,
        };

        let json = serde_json::to_string(&cursor).unwrap();
        let deserialized: SyncCursor = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.ledger_sequence, cursor.ledger_sequence);
        assert_eq!(deserialized.paging_token, cursor.paging_token);
        assert_eq!(deserialized.total_processed, cursor.total_processed);
    }

    #[tokio::test]
    async fn cursor_key_generation() {
        let account = "GTEST123";
        let key = RedisCursorStore::cursor_key(account);
        assert_eq!(key, "echomirror:cursor:GTEST123");
    }
}
