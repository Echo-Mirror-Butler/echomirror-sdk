use chrono::{DateTime, Utc};
use pyo3::prelude::*;

fn dt(d: DateTime<Utc>) -> String {
    d.to_rfc3339()
}

fn opt_dt(d: Option<DateTime<Utc>>) -> Option<String> {
    d.map(dt)
}

// ── Mood ─────────────────────────────────────────────────────────────────────

/// A single mood check-in.
#[pyclass(name = "AiReflection", get_all)]
#[derive(Clone)]
pub struct PyAiReflection {
    pub id: String,
    pub entry_id: String,
    pub content: String,
    pub sentiment: String,
    pub themes: Vec<String>,
    pub generated_at: String,
}

impl From<echomirror_core::AiReflection> for PyAiReflection {
    fn from(r: echomirror_core::AiReflection) -> Self {
        Self {
            id: r.id,
            entry_id: r.entry_id,
            content: r.content,
            sentiment: r.sentiment,
            themes: r.themes,
            generated_at: dt(r.generated_at),
        }
    }
}

#[pymethods]
impl PyAiReflection {
    fn __repr__(&self) -> String {
        format!(
            "AiReflection(id={:?}, sentiment={:?})",
            self.id, self.sentiment
        )
    }
}

/// A single mood check-in. `created_at`/`updated_at` are ISO-8601 strings.
#[pyclass(name = "MoodEntry", get_all)]
#[derive(Clone)]
pub struct PyMoodEntry {
    pub id: String,
    pub user_id: String,
    pub score: u8,
    pub note: Option<String>,
    pub tags: Vec<String>,
    pub ai_reflection: Option<PyAiReflection>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<echomirror_core::MoodEntry> for PyMoodEntry {
    fn from(e: echomirror_core::MoodEntry) -> Self {
        Self {
            id: e.id,
            user_id: e.user_id,
            score: e.score,
            note: e.note,
            tags: e.tags,
            ai_reflection: e.ai_reflection.map(Into::into),
            created_at: dt(e.created_at),
            updated_at: dt(e.updated_at),
        }
    }
}

#[pymethods]
impl PyMoodEntry {
    fn __repr__(&self) -> String {
        format!(
            "MoodEntry(id={:?}, score={}, tags={:?})",
            self.id, self.score, self.tags
        )
    }
}

#[pyclass(name = "MoodStreak", get_all)]
#[derive(Clone)]
pub struct PyMoodStreak {
    pub current: u32,
    pub longest: u32,
    pub last_logged_at: Option<String>,
    pub is_active_today: bool,
}

impl From<echomirror_core::MoodStreak> for PyMoodStreak {
    fn from(s: echomirror_core::MoodStreak) -> Self {
        Self {
            current: s.current,
            longest: s.longest,
            last_logged_at: opt_dt(s.last_logged_at),
            is_active_today: s.is_active_today,
        }
    }
}

#[pymethods]
impl PyMoodStreak {
    fn __repr__(&self) -> String {
        format!(
            "MoodStreak(current={}, longest={}, is_active_today={})",
            self.current, self.longest, self.is_active_today
        )
    }
}

#[pyclass(name = "MoodSummary", get_all)]
#[derive(Clone)]
pub struct PyMoodSummary {
    pub period: String,
    pub average: f64,
    pub min: u8,
    pub max: u8,
    pub total_entries: u32,
    pub trend: String,
}

impl From<echomirror_core::MoodSummary> for PyMoodSummary {
    fn from(s: echomirror_core::MoodSummary) -> Self {
        let trend = match s.trend {
            echomirror_core::MoodTrend::Improving => "improving",
            echomirror_core::MoodTrend::Declining => "declining",
            echomirror_core::MoodTrend::Stable => "stable",
        };
        Self {
            period: s.period,
            average: s.average,
            min: s.min,
            max: s.max,
            total_entries: s.total_entries,
            trend: trend.to_string(),
        }
    }
}

#[pymethods]
impl PyMoodSummary {
    fn __repr__(&self) -> String {
        format!(
            "MoodSummary(period={:?}, average={}, trend={:?})",
            self.period, self.average, self.trend
        )
    }
}

/// A page of mood history: `entries` plus the `total` count matching the query.
#[pyclass(name = "MoodHistoryPage", get_all)]
pub struct PyMoodHistoryPage {
    pub entries: Vec<PyMoodEntry>,
    pub total: u32,
}

// ── Stellar ───────────────────────────────────────────────────────────────────

#[pyclass(name = "StellarBalance", get_all)]
#[derive(Clone)]
pub struct PyStellarBalance {
    pub xlm: String,
    pub echo: String,
    pub public_key: String,
    pub network: String,
    pub last_fetched: String,
}

impl From<echomirror_core::StellarBalance> for PyStellarBalance {
    fn from(b: echomirror_core::StellarBalance) -> Self {
        Self {
            xlm: b.xlm,
            echo: b.echo,
            public_key: b.public_key,
            network: b.network,
            last_fetched: dt(b.last_fetched),
        }
    }
}

#[pymethods]
impl PyStellarBalance {
    fn __repr__(&self) -> String {
        format!("StellarBalance(xlm={:?}, echo={:?})", self.xlm, self.echo)
    }
}

#[pyclass(name = "StellarTransaction", get_all)]
#[derive(Clone)]
pub struct PyStellarTransaction {
    pub id: String,
    pub tx_type: String,
    pub asset: String,
    pub amount: String,
    pub from_address: String,
    pub to_address: String,
    pub memo: Option<String>,
    pub created_at: String,
    pub stellar_tx_hash: String,
    pub ledger_sequence: Option<u32>,
}

impl From<echomirror_core::StellarTransaction> for PyStellarTransaction {
    fn from(t: echomirror_core::StellarTransaction) -> Self {
        let tx_type = match t.tx_type {
            echomirror_core::TransactionType::Send => "send",
            echomirror_core::TransactionType::Receive => "receive",
        };
        Self {
            id: t.id,
            tx_type: tx_type.to_string(),
            asset: t.asset,
            amount: t.amount,
            from_address: t.from,
            to_address: t.to,
            memo: t.memo,
            created_at: dt(t.created_at),
            stellar_tx_hash: t.stellar_tx_hash,
            ledger_sequence: t.ledger_sequence,
        }
    }
}

#[pymethods]
impl PyStellarTransaction {
    fn __repr__(&self) -> String {
        format!(
            "StellarTransaction(id={:?}, type={:?}, amount={:?})",
            self.id, self.tx_type, self.amount
        )
    }
}

/// An unsigned transaction envelope — sign the `xdr` with the sender's
/// keypair (or a wallet such as Freighter) before calling `submit_transaction`.
#[pyclass(name = "UnsignedTransaction", get_all)]
#[derive(Clone)]
pub struct PyUnsignedTransaction {
    pub xdr: String,
    pub fee: u32,
    pub sequence: String,
}

impl From<echomirror_stellar::UnsignedTransaction> for PyUnsignedTransaction {
    fn from(u: echomirror_stellar::UnsignedTransaction) -> Self {
        Self {
            xdr: u.xdr,
            fee: u.fee,
            sequence: u.sequence,
        }
    }
}

#[pymethods]
impl PyUnsignedTransaction {
    fn __repr__(&self) -> String {
        format!(
            "UnsignedTransaction(fee={}, sequence={:?})",
            self.fee, self.sequence
        )
    }
}

/// A page of Stellar transaction history plus an opaque `cursor` for the next page.
#[pyclass(name = "TransactionHistoryPage", get_all)]
pub struct PyTransactionHistoryPage {
    pub transactions: Vec<PyStellarTransaction>,
    pub cursor: Option<String>,
}

// ── Social ────────────────────────────────────────────────────────────────────

#[pyclass(name = "UserProfile", get_all)]
#[derive(Clone)]
pub struct PyUserProfile {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub echo_balance: String,
    pub current_streak: u32,
    pub total_entries: u32,
    pub joined_at: String,
}

impl From<echomirror_core::UserProfile> for PyUserProfile {
    fn from(u: echomirror_core::UserProfile) -> Self {
        Self {
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            echo_balance: u.echo_balance,
            current_streak: u.current_streak,
            total_entries: u.total_entries,
            joined_at: dt(u.joined_at),
        }
    }
}

#[pymethods]
impl PyUserProfile {
    fn __repr__(&self) -> String {
        format!("UserProfile(username={:?})", self.username)
    }
}

#[pyclass(name = "LeaderboardEntry", get_all)]
#[derive(Clone)]
pub struct PyLeaderboardEntry {
    pub rank: u32,
    pub user_id: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub streak: u32,
    pub total_entries: u32,
    pub echo_balance: String,
    pub weekly_score: f64,
}

impl From<echomirror_core::LeaderboardEntry> for PyLeaderboardEntry {
    fn from(e: echomirror_core::LeaderboardEntry) -> Self {
        Self {
            rank: e.rank,
            user_id: e.user_id,
            display_name: e.display_name,
            avatar_url: e.avatar_url,
            streak: e.streak,
            total_entries: e.total_entries,
            echo_balance: e.echo_balance,
            weekly_score: e.weekly_score,
        }
    }
}

#[pymethods]
impl PyLeaderboardEntry {
    fn __repr__(&self) -> String {
        format!(
            "LeaderboardEntry(rank={}, display_name={:?})",
            self.rank, self.display_name
        )
    }
}

#[pyclass(name = "GlobalFeedEntry", get_all)]
#[derive(Clone)]
pub struct PyGlobalFeedEntry {
    pub id: String,
    pub score: u8,
    pub tags: Vec<String>,
    pub country: Option<String>,
    pub city: Option<String>,
    pub created_at: String,
}

impl From<echomirror_core::GlobalFeedEntry> for PyGlobalFeedEntry {
    fn from(e: echomirror_core::GlobalFeedEntry) -> Self {
        Self {
            id: e.id,
            score: e.score,
            tags: e.tags,
            country: e.country,
            city: e.city,
            created_at: dt(e.created_at),
        }
    }
}

#[pymethods]
impl PyGlobalFeedEntry {
    fn __repr__(&self) -> String {
        format!("GlobalFeedEntry(id={:?}, score={})", self.id, self.score)
    }
}
