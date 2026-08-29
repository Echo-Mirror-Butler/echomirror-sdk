use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::RwLock;

/// Operational metrics for the sync engine — atomic counters shared across all
/// per-account tasks, in the same style as `echomirror_core::ClientMetrics`.
#[derive(Debug, Default)]
pub struct SyncMetrics {
    /// Events emitted to subscribers (after filtering and dedup)
    pub events_emitted: AtomicU64,
    /// Records dropped because their paging token was already processed
    pub events_deduped: AtomicU64,
    /// Records dropped by the configured `SyncFilter`
    pub events_filtered: AtomicU64,
    /// Times an SSE stream was re-established after a drop
    pub reconnects: AtomicU64,
    /// Pages fetched during backfill catch-up
    pub backfill_pages: AtomicU64,
    /// Records processed during backfill catch-up
    pub backfill_records: AtomicU64,
    /// Successful cursor persistence operations
    pub cursor_saves: AtomicU64,
    /// Failed cursor persistence operations
    pub cursor_save_failures: AtomicU64,
    /// Records skipped because they could not be parsed/mapped
    pub parse_errors: AtomicU64,
    /// Operations skipped because they carry no amount (e.g. account_merge)
    pub skipped_ops: AtomicU64,
    /// Number of times subscribers lagged behind the broadcast channel
    pub lag_events: AtomicU64,
    /// Total number of events lost due to subscriber lag
    pub events_lost: AtomicU64,
    /// Unix timestamp (seconds) of the most recently processed record's
    /// `created_at` — compare with now() for cursor lag. 0 = no events yet.
    pub last_event_unix: AtomicI64,
    /// Times this instance successfully became leader for an account.
    pub leases_acquired: AtomicU64,
    /// Times an acquisition attempt found another instance's lease still active.
    pub leases_denied: AtomicU64,
    /// Times this instance lost a previously-held lease (expired without
    /// renewal, or another instance's renewal won a race).
    pub leases_lost: AtomicU64,
    /// Per-account leader-election state: `true` if this instance currently
    /// believes it holds the lease and is actively streaming that account,
    /// `false` if it's a standby. Absent until the first acquire attempt.
    leadership: RwLock<HashMap<String, bool>>,
}

impl SyncMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_emitted(&self) {
        self.events_emitted.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_deduped(&self) {
        self.events_deduped.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_filtered(&self) {
        self.events_filtered.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_reconnect(&self) {
        self.reconnects.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_backfill_page(&self, records: u64) {
        self.backfill_pages.fetch_add(1, Ordering::Relaxed);
        self.backfill_records.fetch_add(records, Ordering::Relaxed);
    }

    pub fn record_cursor_save(&self) {
        self.cursor_saves.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_cursor_save_failure(&self) {
        self.cursor_save_failures.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_parse_error(&self) {
        self.parse_errors.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_skipped_op(&self) {
        self.skipped_ops.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_lag(&self, missed: u64) {
        self.lag_events.fetch_add(1, Ordering::Relaxed);
        self.events_lost.fetch_add(missed, Ordering::Relaxed);
    }

    pub fn record_event_time(&self, unix_seconds: i64) {
        self.last_event_unix.store(unix_seconds, Ordering::Relaxed);
    }

    pub fn record_lease_acquired(&self) {
        self.leases_acquired.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_lease_denied(&self) {
        self.leases_denied.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_lease_lost(&self) {
        self.leases_lost.fetch_add(1, Ordering::Relaxed);
    }

    /// Record this instance's current leader (`true`) / standby (`false`)
    /// state for `account`. Call on every acquire/renew outcome so the state
    /// is always fresh, not just on transitions.
    pub fn set_leader(&self, account: &str, is_leader: bool) {
        self.leadership
            .write()
            .unwrap()
            .insert(account.to_string(), is_leader);
    }

    /// Whether this instance currently believes it holds the lease for
    /// `account`. `false` (including for an unrecognized account) means
    /// standby — it must not be actively streaming.
    pub fn is_leader(&self, account: &str) -> bool {
        self.leadership
            .read()
            .unwrap()
            .get(account)
            .copied()
            .unwrap_or(false)
    }

    pub fn snapshot(&self) -> SyncMetricsSnapshot {
        SyncMetricsSnapshot {
            events_emitted: self.events_emitted.load(Ordering::Relaxed),
            events_deduped: self.events_deduped.load(Ordering::Relaxed),
            events_filtered: self.events_filtered.load(Ordering::Relaxed),
            reconnects: self.reconnects.load(Ordering::Relaxed),
            backfill_pages: self.backfill_pages.load(Ordering::Relaxed),
            backfill_records: self.backfill_records.load(Ordering::Relaxed),
            cursor_saves: self.cursor_saves.load(Ordering::Relaxed),
            cursor_save_failures: self.cursor_save_failures.load(Ordering::Relaxed),
            parse_errors: self.parse_errors.load(Ordering::Relaxed),
            skipped_ops: self.skipped_ops.load(Ordering::Relaxed),
            lag_events: self.lag_events.load(Ordering::Relaxed),
            events_lost: self.events_lost.load(Ordering::Relaxed),
            last_event_unix: self.last_event_unix.load(Ordering::Relaxed),
            leases_acquired: self.leases_acquired.load(Ordering::Relaxed),
            leases_denied: self.leases_denied.load(Ordering::Relaxed),
            leases_lost: self.leases_lost.load(Ordering::Relaxed),
            leadership: self.leadership.read().unwrap().clone(),
        }
    }
}

/// Point-in-time copy of `SyncMetrics`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncMetricsSnapshot {
    pub events_emitted: u64,
    pub events_deduped: u64,
    pub events_filtered: u64,
    pub reconnects: u64,
    pub backfill_pages: u64,
    pub backfill_records: u64,
    pub cursor_saves: u64,
    pub cursor_save_failures: u64,
    pub parse_errors: u64,
    pub skipped_ops: u64,
    pub lag_events: u64,
    pub events_lost: u64,
    pub last_event_unix: i64,
    pub leases_acquired: u64,
    pub leases_denied: u64,
    pub leases_lost: u64,
    /// Per-account leader (`true`) / standby (`false`) state at snapshot time.
    pub leadership: HashMap<String, bool>,
}

impl SyncMetricsSnapshot {
    /// Seconds between the last processed record's ledger close time and `now`.
    /// `None` until the first event has been processed.
    pub fn cursor_lag_seconds(&self) -> Option<i64> {
        if self.last_event_unix == 0 {
            None
        } else {
            Some(chrono::Utc::now().timestamp() - self.last_event_unix)
        }
    }

    /// Whether this instance was leader (actively streaming) for `account`
    /// at snapshot time.
    pub fn is_leader(&self, account: &str) -> bool {
        self.leadership.get(account).copied().unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counters_accumulate_and_snapshot() {
        let m = SyncMetrics::new();
        m.record_emitted();
        m.record_emitted();
        m.record_deduped();
        m.record_reconnect();
        m.record_backfill_page(50);
        m.record_backfill_page(3);
        m.record_cursor_save();
        m.record_cursor_save_failure();
        m.record_parse_error();
        m.record_skipped_op();
        m.record_lag(10);
        m.record_lag(5);

        let s = m.snapshot();
        assert_eq!(s.events_emitted, 2);
        assert_eq!(s.events_deduped, 1);
        assert_eq!(s.reconnects, 1);
        assert_eq!(s.backfill_pages, 2);
        assert_eq!(s.backfill_records, 53);
        assert_eq!(s.cursor_saves, 1);
        assert_eq!(s.cursor_save_failures, 1);
        assert_eq!(s.parse_errors, 1);
        assert_eq!(s.skipped_ops, 1);
        assert_eq!(s.lag_events, 2);
        assert_eq!(s.events_lost, 15);
    }

    #[test]
    fn cursor_lag_none_before_first_event() {
        let m = SyncMetrics::new();
        assert_eq!(m.snapshot().cursor_lag_seconds(), None);
        m.record_event_time(chrono::Utc::now().timestamp() - 7);
        let lag = m.snapshot().cursor_lag_seconds().unwrap();
        assert!((7..=9).contains(&lag), "lag was {lag}");
    }
}
