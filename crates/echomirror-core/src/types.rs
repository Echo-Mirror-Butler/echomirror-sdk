use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Mood ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MoodEntry {
    pub id: String,
    pub user_id: String,
    /// 1 (very low) – 10 (excellent)
    pub score: u8,
    pub note: Option<String>,
    pub tags: Vec<String>,
    pub ai_reflection: Option<AiReflection>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MoodStreak {
    pub current: u32,
    pub longest: u32,
    pub last_logged_at: Option<DateTime<Utc>>,
    pub is_active_today: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MoodSummary {
    pub period: String,
    pub average: f64,
    pub min: u8,
    pub max: u8,
    pub total_entries: u32,
    pub trend: MoodTrend,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MoodTrend {
    Improving,
    Declining,
    Stable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AiReflection {
    pub id: String,
    pub entry_id: String,
    pub content: String,
    pub sentiment: String,
    pub themes: Vec<String>,
    pub generated_at: DateTime<Utc>,
}

// ── Stellar ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StellarBalance {
    pub xlm: String,
    pub echo: String,
    pub public_key: String,
    pub network: String,
    pub last_fetched: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StellarTransaction {
    pub id: String,
    #[serde(rename = "type")]
    pub tx_type: TransactionType,
    pub asset: String,
    pub amount: String,
    pub from: String,
    pub to: String,
    pub memo: Option<String>,
    pub created_at: DateTime<Utc>,
    pub stellar_tx_hash: String,
    /// Ledger sequence number — used for deterministic ordering and sync
    pub ledger_sequence: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TransactionType {
    Send,
    Receive,
}

// ── Blockchain sync ───────────────────────────────────────────────────────────

/// Represents one confirmed block/ledger from the Stellar network
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerRecord {
    pub sequence: u32,
    pub hash: String,
    pub closed_at: DateTime<Utc>,
    pub transaction_count: u32,
    pub base_fee: u32,
}

/// Cursor position for resumable blockchain sync
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncCursor {
    pub ledger_sequence: u32,
    pub paging_token: String,
    pub last_synced_at: DateTime<Utc>,
}

/// Event emitted during blockchain sync
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SyncEvent {
    TransactionDetected { tx: StellarTransaction },
    LedgerClosed { ledger: LedgerRecord },
    SyncStarted { from_ledger: u32 },
    SyncPaused { cursor: SyncCursor },
    SyncCompleted { total_processed: u64 },
    Error { message: String },
}

// ── Social ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub echo_balance: String,
    pub current_streak: u32,
    pub total_entries: u32,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalFeedEntry {
    pub id: String,
    /// 1 (very low) – 10 (excellent)
    pub score: u8,
    pub tags: Vec<String>,
    pub country: Option<String>,
    pub city: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardEntry {
    pub rank: u32,
    pub user_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub streak: u32,
    pub total_entries: u32,
    pub echo_balance: String,
    pub weekly_score: f64,
}
