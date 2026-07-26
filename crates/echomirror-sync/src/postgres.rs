use crate::cursor::{CursorStore, SyncCursor};
use chrono::{DateTime, Utc};
use echomirror_core::{EchoMirrorError, Result};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};

fn store_err(context: &str, e: impl std::fmt::Display) -> EchoMirrorError {
    EchoMirrorError::Sync(format!("postgres cursor store: {context}: {e}"))
}

/// PostgreSQL-backed [`CursorStore`].
///
/// Persists one row per watched account in `echomirror_sync_cursors`
/// (see `migrations/0001_create_sync_cursors.sql`). Safe for concurrent use —
/// saves are single upserts.
///
/// ```rust,no_run
/// # async fn example() -> echomirror_core::Result<()> {
/// use echomirror_sync::PgCursorStore;
///
/// // Convenience: pool of 5 + run migrations
/// let store = PgCursorStore::connect("postgres://user:pass@localhost/echomirror").await?;
///
/// // Or share your application's existing pool (run `store.migrate()` once):
/// // let store = PgCursorStore::new(pool);
/// # Ok(())
/// # }
/// ```
pub struct PgCursorStore {
    pool: PgPool,
}

impl PgCursorStore {
    /// Wrap an existing connection pool. Call [`migrate`](Self::migrate) once
    /// before first use unless your deployment applies migrations itself.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Connect with a small dedicated pool (max 5 connections) and apply the
    /// embedded migrations.
    pub async fn connect(database_url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await
            .map_err(|e| store_err("connect", e))?;
        let store = Self::new(pool);
        store.migrate().await?;
        Ok(store)
    }

    /// Apply the crate's embedded migrations. Idempotent.
    pub async fn migrate(&self) -> Result<()> {
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|e| store_err("migrate", e))
    }

    /// The underlying pool, e.g. for health checks.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

#[async_trait::async_trait]
impl CursorStore for PgCursorStore {
    async fn load(&self, account: &str) -> Result<Option<SyncCursor>> {
        let row = sqlx::query(
            "SELECT ledger_sequence, paging_token, last_synced_at, total_processed \
             FROM echomirror_sync_cursors WHERE account = $1",
        )
        .bind(account)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| store_err("load", e))?;

        let Some(row) = row else { return Ok(None) };
        let ledger_sequence: i64 = row.try_get(0).map_err(|e| store_err("load", e))?;
        let paging_token: String = row.try_get(1).map_err(|e| store_err("load", e))?;
        let last_synced_at: DateTime<Utc> = row.try_get(2).map_err(|e| store_err("load", e))?;
        let total_processed: i64 = row.try_get(3).map_err(|e| store_err("load", e))?;

        Ok(Some(SyncCursor {
            ledger_sequence: ledger_sequence as u32,
            paging_token,
            last_synced_at,
            total_processed: total_processed as u64,
        }))
    }

    async fn save(&self, account: &str, cursor: &SyncCursor) -> Result<()> {
        sqlx::query(
            "INSERT INTO echomirror_sync_cursors \
                 (account, ledger_sequence, paging_token, last_synced_at, total_processed) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (account) DO UPDATE SET \
                 ledger_sequence = EXCLUDED.ledger_sequence, \
                 paging_token = EXCLUDED.paging_token, \
                 last_synced_at = EXCLUDED.last_synced_at, \
                 total_processed = EXCLUDED.total_processed, \
                 updated_at = now()",
        )
        .bind(account)
        .bind(cursor.ledger_sequence as i64)
        .bind(&cursor.paging_token)
        .bind(cursor.last_synced_at)
        .bind(cursor.total_processed as i64)
        .execute(&self.pool)
        .await
        .map_err(|e| store_err("save", e))?;
        Ok(())
    }
}
