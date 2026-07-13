use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Resumable cursor for Stellar ledger sync.
/// Persist this between process restarts to avoid re-scanning the entire chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncCursor {
    /// The last fully processed ledger sequence number
    pub ledger_sequence: u32,
    /// Horizon paging token — use this as `cursor=` on the next request
    pub paging_token: String,
    /// When this cursor was last updated
    pub last_synced_at: DateTime<Utc>,
    /// Number of transactions processed since sync started
    pub total_processed: u64,
}

impl SyncCursor {
    pub fn genesis() -> Self {
        Self {
            ledger_sequence: 0,
            paging_token: "now".to_string(),
            last_synced_at: Utc::now(),
            total_processed: 0,
        }
    }

    pub fn from_ledger(sequence: u32) -> Self {
        Self {
            ledger_sequence: sequence,
            paging_token: sequence.to_string(),
            last_synced_at: Utc::now(),
            total_processed: 0,
        }
    }
}

/// Trait for persisting sync cursors — implement this to store cursor in
/// a database, Redis, file, or any other backend.
#[async_trait::async_trait]
pub trait CursorStore: Send + Sync {
    async fn load(&self, account: &str) -> Option<SyncCursor>;
    async fn save(&self, account: &str, cursor: &SyncCursor);
}

/// In-memory cursor store — suitable for development and single-process use.
pub struct InMemoryCursorStore {
    cursors: Arc<RwLock<std::collections::HashMap<String, SyncCursor>>>,
}

impl InMemoryCursorStore {
    pub fn new() -> Self {
        Self {
            cursors: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }
}

impl Default for InMemoryCursorStore {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl CursorStore for InMemoryCursorStore {
    async fn load(&self, account: &str) -> Option<SyncCursor> {
        self.cursors.read().await.get(account).cloned()
    }

    async fn save(&self, account: &str, cursor: &SyncCursor) {
        self.cursors
            .write()
            .await
            .insert(account.to_string(), cursor.clone());
    }
}
