use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};

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
    /// Unix timestamp (seconds) of the most recently processed record's
    /// `created_at` — compare with now() for cursor lag. 0 = no events yet.
    pub last_event_unix: AtomicI64,
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

    pub fn record_event_time(&self, unix_seconds: i64) {
        self.last_event_unix.store(unix_seconds, Ordering::Relaxed);
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
            last_event_unix: self.last_event_unix.load(Ordering::Relaxed),
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
    pub last_event_unix: i64,
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
