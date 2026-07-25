use crate::{
    backoff::Backoff,
    cursor::{CursorStore, InMemoryCursorStore, SyncCursor},
    filter::SyncFilter,
    metrics::{SyncMetrics, SyncMetricsSnapshot},
    record::{ledger_from_token, map_payment, parse_paging_token, MapOutcome},
    sse::{ledgers_url, open_sse_stream, payments_url, sse_http_client},
};
use echomirror_core::{EchoMirrorClient, SyncEvent};
use echomirror_stellar::horizon::{HorizonLedgerRecord, HorizonPaymentRecord};
use echomirror_stellar::HorizonClient;
use futures::StreamExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::{sync::Arc, time::Duration};
use tokio::sync::{broadcast, Mutex};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

const DEFAULT_BACKFILL_PAGE_SIZE: u16 = 100;
const DEFAULT_BACKOFF_MIN: Duration = Duration::from_millis(500);
const DEFAULT_BACKOFF_MAX: Duration = Duration::from_secs(60);
const DEFAULT_IDLE_TIMEOUT: Duration = Duration::from_secs(45);
const DEFAULT_CHANNEL_CAPACITY: usize = 1024;
const SSE_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Streams real-time Stellar blockchain events for one or more accounts over
/// Horizon Server-Sent Events, with resumable cursors and automatic recovery.
///
/// ## How it stays reliable
/// - **Streaming** — a long-lived SSE connection per watched account; no polling
/// - **Resumable** — the cursor is persisted after every processed record, so
///   restarts pick up exactly where they left off
/// - **Gap backfill** — every (re)connect first pages from the last persisted
///   cursor to the tip via Horizon's paginated API, then attaches the live
///   stream at that point: the engine never attaches SSE past unseen records
/// - **Deduplicated** — paging tokens are compared numerically per account, so
///   backfilled and streamed records are emitted exactly once
/// - **Self-healing** — dropped or idle streams reconnect with full-jitter
///   exponential backoff, resuming from the persisted cursor
///
/// ## Example
/// ```rust,no_run
/// use echomirror_core::{EchoMirrorClient, EchoMirrorConfig, SyncEvent};
/// use echomirror_sync::{SyncEngine, SyncFilter};
///
/// #[tokio::main]
/// async fn main() {
///     let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("api_key")).unwrap();
///
///     let engine = SyncEngine::builder(&client)
///         .watch("GPUBLIC_KEY1")
///         .watch("GPUBLIC_KEY2")
///         .filter(SyncFilter::new().asset("ECHO").min_amount(1.0))
///         .build();
///
///     let mut stream = engine.subscribe();
///     engine.clone().start();
///
///     while let Ok(event) = stream.recv().await {
///         match event {
///             SyncEvent::TransactionDetected { tx } => println!("TX: {}", tx.id),
///             SyncEvent::SyncPaused { cursor } => println!("reconnecting from {}", cursor.paging_token),
///             _ => {}
///         }
///     }
/// }
/// ```
pub struct SyncEngine {
    client: Arc<EchoMirrorClient>,
    accounts: Vec<String>,
    filter: SyncFilter,
    cursor_store: Arc<dyn CursorStore>,
    backfill_page_size: u16,
    backoff_min: Duration,
    backoff_max: Duration,
    idle_timeout: Duration,
    watch_ledgers: bool,
    start_from_now: bool,
    tx: broadcast::Sender<SyncEvent>,
    metrics: Arc<SyncMetrics>,
    cancel: CancellationToken,
    started: AtomicBool,
    supervisor: Mutex<Option<JoinHandle<()>>>,
}

pub struct SyncEngineBuilder {
    client: Arc<EchoMirrorClient>,
    accounts: Vec<String>,
    filter: SyncFilter,
    cursor_store: Arc<dyn CursorStore>,
    backfill_page_size: u16,
    backoff_min: Duration,
    backoff_max: Duration,
    idle_timeout: Duration,
    watch_ledgers: bool,
    start_from_now: bool,
    channel_capacity: usize,
}

impl SyncEngine {
    pub fn builder(client: &EchoMirrorClient) -> SyncEngineBuilder {
        SyncEngineBuilder {
            client: Arc::new(client.clone()),
            accounts: Vec::new(),
            filter: SyncFilter::new(),
            cursor_store: Arc::new(InMemoryCursorStore::new()),
            backfill_page_size: DEFAULT_BACKFILL_PAGE_SIZE,
            backoff_min: DEFAULT_BACKOFF_MIN,
            backoff_max: DEFAULT_BACKOFF_MAX,
            idle_timeout: DEFAULT_IDLE_TIMEOUT,
            watch_ledgers: false,
            start_from_now: false,
            channel_capacity: DEFAULT_CHANNEL_CAPACITY,
        }
    }

    /// Subscribe to the event stream. Call before `start()`.
    ///
    /// Slow subscribers may observe `RecvError::Lagged` if they fall more than
    /// the channel capacity behind (see `SyncEngineBuilder::channel_capacity`).
    pub fn subscribe(&self) -> broadcast::Receiver<SyncEvent> {
        self.tx.subscribe()
    }

    /// Start syncing in background Tokio tasks (one per watched account).
    /// Calling `start` more than once is a no-op.
    pub fn start(self: Arc<Self>) {
        if self.started.swap(true, Ordering::SeqCst) {
            return;
        }

        let mut handles: Vec<JoinHandle<u64>> = Vec::new();
        for account in self.accounts.clone() {
            let engine = self.clone();
            handles.push(tokio::spawn(
                async move { engine.run_account(account).await },
            ));
        }
        if self.watch_ledgers {
            let engine = self.clone();
            handles.push(tokio::spawn(async move { engine.run_ledgers().await }));
        }

        let engine = self.clone();
        let supervisor = tokio::spawn(async move {
            let mut total_processed: u64 = 0;
            for handle in handles {
                if let Ok(n) = handle.await {
                    total_processed += n;
                }
            }
            let _ = engine.tx.send(SyncEvent::SyncCompleted { total_processed });
        });

        // start() is sync, so try_lock is safe: nothing else holds the lock
        // before the engine has started.
        if let Ok(mut slot) = self.supervisor.try_lock() {
            *slot = Some(supervisor);
        }
    }

    /// Signal all sync tasks to stop. Each task persists its cursor with every
    /// processed record, so a later restart resumes without data loss. A final
    /// `SyncCompleted` event is emitted once all tasks have drained.
    pub fn stop(&self) {
        self.cancel.cancel();
    }

    /// Wait until all sync tasks have fully drained after `stop()`.
    pub async fn stopped(&self) {
        let handle = self.supervisor.lock().await.take();
        if let Some(handle) = handle {
            let _ = handle.await;
        }
    }

    /// Snapshot of the engine's operational metrics.
    pub fn metrics(&self) -> SyncMetricsSnapshot {
        self.metrics.snapshot()
    }

    /// Main loop for one watched account: load cursor → backfill the gap →
    /// attach live SSE → on drop, back off and repeat. Returns the number of
    /// records processed (for the engine-wide `SyncCompleted` total).
    async fn run_account(&self, account: String) -> u64 {
        let base_url = self.client.config().resolved_horizon_url();
        let horizon = HorizonClient::new(base_url.clone());
        let sse_http = match sse_http_client(SSE_CONNECT_TIMEOUT) {
            Ok(client) => client,
            Err(e) => {
                let _ = self.tx.send(SyncEvent::Error {
                    message: format!("failed to build SSE client for {account}: {e}"),
                });
                return 0;
            }
        };

        let mut backoff = Backoff::new(self.backoff_min, self.backoff_max);
        let mut first_attach = true;
        let mut total_processed: u64 = 0;

        while !self.cancel.is_cancelled() {
            // 1. Load the persisted cursor (or start fresh).
            let loaded = if first_attach && self.start_from_now {
                Ok(None)
            } else {
                self.cursor_store.load(&account).await
            };
            let mut cursor = match loaded {
                Ok(Some(cursor)) => cursor,
                Ok(None) => SyncCursor::genesis(),
                Err(e) => {
                    let _ = self.tx.send(SyncEvent::Error {
                        message: format!("cursor load failed for {account}: {e}"),
                    });
                    if self.sleep_backoff(&mut backoff).await {
                        break;
                    }
                    continue;
                }
            };
            first_attach = false;

            let _ = self.tx.send(SyncEvent::SyncStarted {
                from_ledger: cursor.ledger_sequence,
            });

            let mut last_seen: u64 = parse_paging_token(&cursor.paging_token).unwrap_or(0);

            // 2. Backfill everything between the cursor and the tip. This is
            //    also the gap-fill after a reconnect: SSE is only attached at
            //    a token we have fully paged up to.
            if cursor.paging_token != "now" {
                if let Err(e) = self
                    .backfill(
                        &horizon,
                        &account,
                        &mut cursor,
                        &mut last_seen,
                        &mut total_processed,
                    )
                    .await
                {
                    let _ = self.tx.send(SyncEvent::Error {
                        message: format!("backfill failed for {account}: {e}"),
                    });
                    if self.sleep_backoff(&mut backoff).await {
                        break;
                    }
                    continue;
                }
            }
            if self.cancel.is_cancelled() {
                break;
            }

            // 3. Attach the live SSE stream at the backfilled position.
            let url = payments_url(&base_url, &account, &cursor.paging_token, true);
            let mut stream = match open_sse_stream(&sse_http, &url, self.idle_timeout).await {
                Ok(stream) => stream,
                Err(e) => {
                    let _ = self.tx.send(SyncEvent::Error {
                        message: format!("SSE connect failed for {account}: {e}"),
                    });
                    if self.sleep_backoff(&mut backoff).await {
                        break;
                    }
                    continue;
                }
            };

            // 4. Consume live events until the stream drops or we're stopped.
            loop {
                let item = tokio::select! {
                    _ = self.cancel.cancelled() => None,
                    item = stream.next() => item,
                };
                let Some(item) = item else { break };

                match item {
                    Ok(msg) if msg.event == "open" || msg.data.trim() == "\"hello\"" => continue,
                    Ok(msg) if msg.event == "close" || msg.data.trim() == "\"byebye\"" => break,
                    Ok(msg) => match serde_json::from_str::<HorizonPaymentRecord>(&msg.data) {
                        Ok(record) => {
                            if self
                                .process_record(
                                    &record,
                                    &account,
                                    &mut last_seen,
                                    &mut cursor,
                                    &mut total_processed,
                                )
                                .await
                            {
                                self.save_cursor(&account, &cursor).await;
                                backoff.reset();
                            }
                        }
                        Err(e) => {
                            self.metrics.record_parse_error();
                            tracing::warn!(
                                account = %account,
                                error = %e,
                                "skipping unparseable SSE payment record"
                            );
                        }
                    },
                    Err(e) => {
                        tracing::warn!(
                            account = %account,
                            error = %e,
                            "SSE stream error — reconnecting"
                        );
                        break;
                    }
                }
            }

            if self.cancel.is_cancelled() {
                break;
            }

            // 5. Stream dropped: announce the pause and reconnect with backoff.
            let _ = self.tx.send(SyncEvent::SyncPaused {
                cursor: echomirror_core::SyncCursor {
                    ledger_sequence: cursor.ledger_sequence,
                    paging_token: cursor.paging_token.clone(),
                    last_synced_at: cursor.last_synced_at,
                },
            });
            self.metrics.record_reconnect();
            if self.sleep_backoff(&mut backoff).await {
                break;
            }
        }

        total_processed
    }

    /// Page from the cursor to the tip via the paginated API, emitting and
    /// persisting as we go. Cursor advances past filtered-out records too —
    /// otherwise a restart would re-scan them forever.
    async fn backfill(
        &self,
        horizon: &HorizonClient,
        account: &str,
        cursor: &mut SyncCursor,
        last_seen: &mut u64,
        total_processed: &mut u64,
    ) -> echomirror_core::Result<()> {
        loop {
            if self.cancel.is_cancelled() {
                return Ok(());
            }

            let page = horizon
                .get_payments(
                    account,
                    Some(&cursor.paging_token),
                    self.backfill_page_size,
                    true,
                )
                .await?;
            let records = page.embedded.records;
            self.metrics.record_backfill_page(records.len() as u64);
            if records.is_empty() {
                return Ok(());
            }

            for record in &records {
                self.process_record(record, account, last_seen, cursor, total_processed)
                    .await;
            }
            self.save_cursor(account, cursor).await;

            if records.len() < self.backfill_page_size as usize {
                return Ok(());
            }
        }
    }

    /// Dedup → map → filter → emit one record, advancing the in-memory cursor.
    /// Returns whether the record advanced the cursor (i.e. was not a dupe).
    /// Persisting the cursor is the caller's job (per record when live, per
    /// page during backfill).
    async fn process_record(
        &self,
        record: &HorizonPaymentRecord,
        account: &str,
        last_seen: &mut u64,
        cursor: &mut SyncCursor,
        total_processed: &mut u64,
    ) -> bool {
        let Some(token) = parse_paging_token(&record.paging_token) else {
            self.metrics.record_parse_error();
            tracing::warn!(
                account = %account,
                paging_token = %record.paging_token,
                "skipping record with unparseable paging token"
            );
            return false;
        };
        if token <= *last_seen {
            self.metrics.record_deduped();
            return false;
        }
        *last_seen = token;
        *total_processed += 1;

        let mut ledger_sequence = ledger_from_token(token);
        match map_payment(record, account) {
            Ok(MapOutcome::Mapped(mapped)) => {
                ledger_sequence = mapped.sync_record.ledger_sequence;
                self.metrics
                    .record_event_time(mapped.tx.created_at.timestamp());
                if self.filter.matches(&mapped.sync_record) {
                    let _ = self
                        .tx
                        .send(SyncEvent::TransactionDetected { tx: mapped.tx });
                    self.metrics.record_emitted();
                } else {
                    self.metrics.record_filtered();
                }
            }
            Ok(MapOutcome::Skipped) => self.metrics.record_skipped_op(),
            Err(e) => {
                self.metrics.record_parse_error();
                tracing::warn!(account = %account, error = %e, "skipping unmappable record");
            }
        }

        cursor.ledger_sequence = ledger_sequence;
        cursor.paging_token = record.paging_token.clone();
        cursor.last_synced_at = chrono::Utc::now();
        cursor.total_processed += 1;
        true
    }

    async fn save_cursor(&self, account: &str, cursor: &SyncCursor) {
        match self.cursor_store.save(account, cursor).await {
            Ok(()) => self.metrics.record_cursor_save(),
            Err(e) => {
                self.metrics.record_cursor_save_failure();
                tracing::warn!(account = %account, error = %e, "cursor save failed");
            }
        }
    }

    /// Live tail of `/ledgers` (opt-in via `watch_ledgers`). Notification-only:
    /// no cursor is persisted and missed ledgers are not backfilled.
    async fn run_ledgers(&self) -> u64 {
        let base_url = self.client.config().resolved_horizon_url();
        let sse_http = match sse_http_client(SSE_CONNECT_TIMEOUT) {
            Ok(client) => client,
            Err(e) => {
                let _ = self.tx.send(SyncEvent::Error {
                    message: format!("failed to build SSE client for ledger stream: {e}"),
                });
                return 0;
            }
        };
        let mut backoff = Backoff::new(self.backoff_min, self.backoff_max);

        while !self.cancel.is_cancelled() {
            let mut stream = match open_sse_stream(
                &sse_http,
                &ledgers_url(&base_url),
                self.idle_timeout,
            )
            .await
            {
                Ok(stream) => stream,
                Err(e) => {
                    let _ = self.tx.send(SyncEvent::Error {
                        message: format!("ledger SSE connect failed: {e}"),
                    });
                    if self.sleep_backoff(&mut backoff).await {
                        break;
                    }
                    continue;
                }
            };

            loop {
                let item = tokio::select! {
                    _ = self.cancel.cancelled() => None,
                    item = stream.next() => item,
                };
                let Some(item) = item else { break };

                match item {
                    Ok(msg) if msg.event == "open" || msg.data.trim() == "\"hello\"" => continue,
                    Ok(msg) if msg.event == "close" || msg.data.trim() == "\"byebye\"" => break,
                    Ok(msg) => match serde_json::from_str::<HorizonLedgerRecord>(&msg.data) {
                        Ok(ledger) => {
                            backoff.reset();
                            let _ = self.tx.send(SyncEvent::LedgerClosed {
                                ledger: echomirror_core::LedgerRecord {
                                    sequence: ledger.sequence,
                                    hash: ledger.hash,
                                    closed_at: ledger.closed_at.parse().unwrap_or_default(),
                                    transaction_count: ledger
                                        .successful_transaction_count
                                        .unwrap_or(0),
                                    base_fee: ledger.base_fee_in_stroops.unwrap_or(100),
                                },
                            });
                        }
                        Err(e) => {
                            self.metrics.record_parse_error();
                            tracing::warn!(error = %e, "skipping unparseable ledger record");
                        }
                    },
                    Err(e) => {
                        tracing::warn!(error = %e, "ledger SSE stream error — reconnecting");
                        break;
                    }
                }
            }

            if self.cancel.is_cancelled() {
                break;
            }
            self.metrics.record_reconnect();
            if self.sleep_backoff(&mut backoff).await {
                break;
            }
        }
        0
    }

    /// Jittered backoff sleep. Returns true if the engine was stopped while
    /// sleeping.
    async fn sleep_backoff(&self, backoff: &mut Backoff) -> bool {
        let delay = backoff.next_delay();
        tokio::select! {
            _ = self.cancel.cancelled() => true,
            _ = tokio::time::sleep(delay) => false,
        }
    }
}

impl SyncEngineBuilder {
    /// Watch an account's payments. Call multiple times for multiple accounts
    /// (each gets its own SSE connection — mind Horizon rate limits beyond a
    /// few dozen accounts).
    pub fn watch(mut self, public_key: impl Into<String>) -> Self {
        self.accounts.push(public_key.into());
        self
    }

    pub fn filter(mut self, filter: SyncFilter) -> Self {
        self.filter = filter;
        self
    }

    pub fn cursor_store(mut self, store: Arc<dyn CursorStore>) -> Self {
        self.cursor_store = store;
        self
    }

    /// Page size used while backfilling missed records (1–200, default 100).
    pub fn backfill_page_size(mut self, size: u16) -> Self {
        self.backfill_page_size = size.clamp(1, 200);
        self
    }

    /// Bounds for the full-jitter exponential reconnect backoff
    /// (default 500ms–60s).
    pub fn reconnect_backoff(mut self, min: Duration, max: Duration) -> Self {
        self.backoff_min = min;
        self.backoff_max = max.max(min);
        self
    }

    /// How long a stream may go without any bytes (Horizon heartbeats count)
    /// before it is treated as dead and reconnected (default 45s).
    pub fn idle_timeout(mut self, timeout: Duration) -> Self {
        self.idle_timeout = timeout;
        self
    }

    /// Capacity of the broadcast channel delivered to subscribers
    /// (default 1024). Slow subscribers lag rather than block the engine.
    pub fn channel_capacity(mut self, capacity: usize) -> Self {
        self.channel_capacity = capacity.max(1);
        self
    }

    /// Also emit `LedgerClosed` for every ledger via a live `/ledgers` stream.
    /// Notification-only: ledger events are not persisted or backfilled.
    pub fn watch_ledgers(mut self, enabled: bool) -> Self {
        self.watch_ledgers = enabled;
        self
    }

    /// Ignore any stored cursor on startup and tail from the current tip.
    pub fn start_from_now(mut self) -> Self {
        self.start_from_now = true;
        self
    }

    pub fn build(self) -> Arc<SyncEngine> {
        let (tx, _) = broadcast::channel(self.channel_capacity);
        Arc::new(SyncEngine {
            client: self.client,
            accounts: self.accounts,
            filter: self.filter,
            cursor_store: self.cursor_store,
            backfill_page_size: self.backfill_page_size,
            backoff_min: self.backoff_min,
            backoff_max: self.backoff_max,
            idle_timeout: self.idle_timeout,
            watch_ledgers: self.watch_ledgers,
            start_from_now: self.start_from_now,
            tx,
            metrics: Arc::new(SyncMetrics::new()),
            cancel: CancellationToken::new(),
            started: AtomicBool::new(false),
            supervisor: Mutex::new(None),
        })
    }
}
