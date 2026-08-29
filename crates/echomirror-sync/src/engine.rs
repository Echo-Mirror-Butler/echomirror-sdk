use crate::{
    backoff::Backoff,
    cursor::{CursorStore, InMemoryCursorStore, SyncCursor},
    election::{LeaderElector, SingleProcessElector},
    filter::SyncFilter,
    metrics::{SyncMetrics, SyncMetricsSnapshot},
    record::{ledger_from_token, map_payment, parse_paging_token, MapOutcome},
    sse::{ledgers_url, open_sse_stream, payments_url, sse_http_client},
    stream::SyncEventStream,
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
/// How long an acquired leadership lease is valid for before it must be
/// renewed. A crashed leader that stops renewing frees the account for
/// takeover after this elapses.
const DEFAULT_LEASE_TTL: Duration = Duration::from_secs(15);
/// How often an active leader renews its lease. Comfortably inside the TTL
/// so a couple of missed renewals (GC pause, transient backend hiccup) don't
/// cause an unnecessary handoff.
const DEFAULT_LEASE_RENEW_INTERVAL: Duration = Duration::from_secs(5);
/// Backoff bounds for a standby's retry loop while it doesn't hold the lease.
const DEFAULT_LEASE_RETRY_MIN: Duration = Duration::from_millis(500);
const DEFAULT_LEASE_RETRY_MAX: Duration = Duration::from_secs(30);

fn default_holder_id() -> String {
    format!("{}-{:x}", std::process::id(), rand::random::<u64>())
}

/// Cancels a `CancellationToken` when dropped — including on abnormal
/// teardown (task abort, panic unwind), not just a normal return. Used to
/// make sure a detached lease-renewal task is always told to stop once its
/// owning session ends, however that happens.
struct CancelOnDrop(CancellationToken);

impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

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
/// - **Coordinated** — a per-account leadership lease ([`LeaderElector`])
///   ensures only one instance actively streams a given account when
///   horizontally scaled; others sit as standbys and take over automatically
///   if the leader stops renewing (crash or clean shutdown alike)
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
    elector: Arc<dyn LeaderElector>,
    holder_id: String,
    lease_ttl: Duration,
    lease_renew_interval: Duration,
    lease_retry_min: Duration,
    lease_retry_max: Duration,
    tx: broadcast::Sender<SyncEvent>,
    metrics: Arc<SyncMetrics>,
    cancel: CancellationToken,
    started: AtomicBool,
    supervisor: Mutex<Option<JoinHandle<()>>>,
    #[cfg(feature = "test-util")]
    account_handles: Mutex<Vec<tokio::task::AbortHandle>>,
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
    elector: Arc<dyn LeaderElector>,
    holder_id: String,
    lease_ttl: Duration,
    lease_renew_interval: Duration,
    lease_retry_min: Duration,
    lease_retry_max: Duration,
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
            elector: Arc::new(SingleProcessElector::new()),
            holder_id: default_holder_id(),
            lease_ttl: DEFAULT_LEASE_TTL,
            lease_renew_interval: DEFAULT_LEASE_RENEW_INTERVAL,
            lease_retry_min: DEFAULT_LEASE_RETRY_MIN,
            lease_retry_max: DEFAULT_LEASE_RETRY_MAX,
            channel_capacity: DEFAULT_CHANNEL_CAPACITY,
        }
    }

    /// Subscribe to the raw broadcast event stream. Call before `start()`.
    ///
    /// Slow subscribers may observe `RecvError::Lagged` if they fall more than
    /// the channel capacity behind (see `SyncEngineBuilder::channel_capacity`).
    pub fn subscribe(&self) -> broadcast::Receiver<SyncEvent> {
        self.tx.subscribe()
    }

    /// Subscribe to a managed `SyncEventStream` that automatically detects lag gaps,
    /// emits `SyncEvent::GapDetected`, and tracks loss metrics.
    pub fn subscribe_stream(&self) -> SyncEventStream {
        SyncEventStream::new_with_metrics(self.tx.subscribe(), self.metrics.clone())
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

        #[cfg(feature = "test-util")]
        {
            // start() is sync, so try_lock is safe here too.
            if let Ok(mut slot) = self.account_handles.try_lock() {
                for handle in &handles {
                    slot.push(handle.abort_handle());
                }
            }
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

    /// Test-only: kill every per-account sync task immediately, bypassing
    /// cooperative cancellation entirely — no lease release, no cursor flush.
    /// Simulates an unclean process crash so tests can verify that another
    /// instance takes over once the held leadership lease naturally expires.
    /// Requires the `test-util` feature.
    #[cfg(feature = "test-util")]
    pub fn crash_for_test(&self) {
        if let Ok(handles) = self.account_handles.try_lock() {
            for handle in handles.iter() {
                handle.abort();
            }
        }
    }

    /// Snapshot of the engine's operational metrics.
    pub fn metrics(&self) -> SyncMetricsSnapshot {
        self.metrics.snapshot()
    }

    /// Per-account entry point: repeatedly attempt to acquire (or renew) the
    /// leadership lease for `account`, actively stream while held, and
    /// otherwise sit as a standby retrying on a backoff. Returns the number
    /// of records processed (for the engine-wide `SyncCompleted` total).
    ///
    /// This is the leader-election guard around [`stream_account`]: an
    /// instance that can't acquire the lease never reaches the streaming
    /// logic at all, so two instances configured for the same account can
    /// never both actively stream it.
    ///
    /// [`stream_account`]: Self::stream_account
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

        let mut total_processed: u64 = 0;
        let mut retry_backoff = Backoff::new(self.lease_retry_min, self.lease_retry_max);

        while !self.cancel.is_cancelled() {
            match self
                .elector
                .try_acquire(&account, &self.holder_id, self.lease_ttl)
                .await
            {
                Ok(true) => {
                    self.metrics.record_lease_acquired();
                    self.metrics.set_leader(&account, true);
                    tracing::info!(
                        account = %account,
                        holder = %self.holder_id,
                        "acquired sync leadership lease"
                    );
                    retry_backoff.reset();

                    // A child of self.cancel: cancelled by global stop() as
                    // well as by the renewal task below the moment the lease
                    // is lost, so stream_account reacts to either the same way.
                    let session_cancel = self.cancel.child_token();
                    // Guarantees the renewal task below is told to stop even
                    // if this task is torn down abnormally (aborted or
                    // panicking) instead of returning normally from
                    // stream_account — otherwise it would keep renewing a
                    // lease nobody is actively holding anymore.
                    let _cancel_guard = CancelOnDrop(session_cancel.clone());
                    let renewal = self.spawn_lease_renewal(account.clone(), session_cancel.clone());

                    total_processed += self
                        .stream_account(&account, &horizon, &sse_http, &base_url, &session_cancel)
                        .await;

                    renewal.abort();
                    self.metrics.set_leader(&account, false);
                    let _ = self.elector.release(&account, &self.holder_id).await;
                }
                Ok(false) => {
                    self.metrics.record_lease_denied();
                    self.metrics.set_leader(&account, false);
                    tracing::debug!(
                        account = %account,
                        "standby: sync lease for this account is held elsewhere"
                    );
                    if self.sleep_backoff(&self.cancel, &mut retry_backoff).await {
                        break;
                    }
                }
                Err(e) => {
                    tracing::warn!(account = %account, error = %e, "lease acquisition error");
                    if self.sleep_backoff(&self.cancel, &mut retry_backoff).await {
                        break;
                    }
                }
            }
        }

        total_processed
    }

    /// Periodically renew the leadership lease for `account` while
    /// `session_cancel` is live. Cancels `session_cancel` itself (stepping
    /// down) the moment a renewal is denied or errors, so the caller's
    /// streaming loop unwinds promptly instead of continuing to run without
    /// actually holding the lease.
    fn spawn_lease_renewal(
        &self,
        account: String,
        session_cancel: CancellationToken,
    ) -> JoinHandle<()> {
        let elector = self.elector.clone();
        let holder_id = self.holder_id.clone();
        let ttl = self.lease_ttl;
        let interval = self.lease_renew_interval;
        let metrics = self.metrics.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = session_cancel.cancelled() => return,
                    _ = tokio::time::sleep(interval) => {}
                }
                match elector.try_acquire(&account, &holder_id, ttl).await {
                    Ok(true) => {}
                    Ok(false) => {
                        metrics.record_lease_lost();
                        metrics.set_leader(&account, false);
                        tracing::warn!(
                            account = %account,
                            "lost sync leadership lease to another instance; stepping down"
                        );
                        session_cancel.cancel();
                        return;
                    }
                    Err(e) => {
                        tracing::warn!(
                            account = %account,
                            error = %e,
                            "lease renewal error; stepping down defensively"
                        );
                        session_cancel.cancel();
                        return;
                    }
                }
            }
        })
    }

    /// Leader-only loop for one watched account: load cursor → backfill the
    /// gap → attach live SSE → on drop, back off and repeat. Runs until
    /// `cancel` fires, whether from a global `stop()` or from losing the
    /// leadership lease. Returns the number of records processed.
    async fn stream_account(
        &self,
        account: &str,
        horizon: &HorizonClient,
        sse_http: &reqwest::Client,
        base_url: &str,
        cancel: &CancellationToken,
    ) -> u64 {
        let mut backoff = Backoff::new(self.backoff_min, self.backoff_max);
        let mut first_attach = true;
        let mut total_processed: u64 = 0;

        while !cancel.is_cancelled() {
            // 1. Load the persisted cursor (or start fresh).
            let loaded = if first_attach && self.start_from_now {
                Ok(None)
            } else {
                self.cursor_store.load(account).await
            };
            let mut cursor = match loaded {
                Ok(Some(cursor)) => cursor,
                Ok(None) => SyncCursor::genesis(),
                Err(e) => {
                    let _ = self.tx.send(SyncEvent::Error {
                        message: format!("cursor load failed for {account}: {e}"),
                    });
                    if self.sleep_backoff(cancel, &mut backoff).await {
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
                        horizon,
                        account,
                        cancel,
                        &mut cursor,
                        &mut last_seen,
                        &mut total_processed,
                    )
                    .await
                {
                    let _ = self.tx.send(SyncEvent::Error {
                        message: format!("backfill failed for {account}: {e}"),
                    });
                    if self.sleep_backoff(cancel, &mut backoff).await {
                        break;
                    }
                    continue;
                }
            }
            if cancel.is_cancelled() {
                break;
            }

            // 3. Attach the live SSE stream at the backfilled position.
            let url = payments_url(base_url, account, &cursor.paging_token, true);
            let mut stream = match open_sse_stream(sse_http, &url, self.idle_timeout).await {
                Ok(stream) => stream,
                Err(e) => {
                    let _ = self.tx.send(SyncEvent::Error {
                        message: format!("SSE connect failed for {account}: {e}"),
                    });
                    if self.sleep_backoff(cancel, &mut backoff).await {
                        break;
                    }
                    continue;
                }
            };

            // 4. Consume live events until the stream drops or we're stopped.
            loop {
                let item = tokio::select! {
                    _ = cancel.cancelled() => None,
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
                                    account,
                                    &mut last_seen,
                                    &mut cursor,
                                    &mut total_processed,
                                )
                                .await
                            {
                                self.save_cursor(account, &cursor).await;
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

            if cancel.is_cancelled() {
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
            if self.sleep_backoff(cancel, &mut backoff).await {
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
        cancel: &CancellationToken,
        cursor: &mut SyncCursor,
        last_seen: &mut u64,
        total_processed: &mut u64,
    ) -> echomirror_core::Result<()> {
        loop {
            if cancel.is_cancelled() {
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
                    if self.sleep_backoff(&self.cancel, &mut backoff).await {
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
            if self.sleep_backoff(&self.cancel, &mut backoff).await {
                break;
            }
        }
        0
    }

    /// Jittered backoff sleep. Returns true if `cancel` fired while sleeping.
    async fn sleep_backoff(&self, cancel: &CancellationToken, backoff: &mut Backoff) -> bool {
        let delay = backoff.next_delay();
        tokio::select! {
            _ = cancel.cancelled() => true,
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
    ///
    /// ## Sizing Guidance
    /// Choose a capacity proportional to your expected event throughput and consumer latency:
    /// `capacity >= expected_events_per_sec * max_consumer_processing_pause_secs`.
    /// For high-volume networks or consumers performing synchronous I/O / DB transactions,
    /// consider 2048–8192 to prevent lag events during burst traffic.
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

    /// Coordination backend for per-account leader election (default:
    /// [`SingleProcessElector`], which only coordinates instances sharing the
    /// same `Arc`). Plug in a shared backend such as
    /// [`crate::PgLeaderElector`] to coordinate real, separately-deployed
    /// instances the same way you would swap in a shared [`CursorStore`].
    pub fn leader_elector(mut self, elector: Arc<dyn LeaderElector>) -> Self {
        self.elector = elector;
        self
    }

    /// Identifier this instance presents to the [`LeaderElector`] (default: a
    /// process-id + random suffix). Only needs to be distinct across
    /// concurrently-running instances sharing an elector backend.
    pub fn holder_id(mut self, id: impl Into<String>) -> Self {
        self.holder_id = id.into();
        self
    }

    /// Leadership lease TTL and how often an active leader renews it
    /// (default 15s / 5s). `renew_interval` is clamped below `ttl` so a
    /// leader always renews with margin to spare.
    pub fn lease(mut self, ttl: Duration, renew_interval: Duration) -> Self {
        self.lease_ttl = ttl;
        self.lease_renew_interval = renew_interval.min(ttl / 2).max(Duration::from_millis(1));
        self
    }

    /// Backoff bounds for a standby's lease-acquisition retry loop
    /// (default 500ms–30s).
    pub fn lease_retry_backoff(mut self, min: Duration, max: Duration) -> Self {
        self.lease_retry_min = min;
        self.lease_retry_max = max.max(min);
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
            elector: self.elector,
            holder_id: self.holder_id,
            lease_ttl: self.lease_ttl,
            lease_renew_interval: self.lease_renew_interval,
            lease_retry_min: self.lease_retry_min,
            lease_retry_max: self.lease_retry_max,
            tx,
            metrics: Arc::new(SyncMetrics::new()),
            cancel: CancellationToken::new(),
            started: AtomicBool::new(false),
            supervisor: Mutex::new(None),
            #[cfg(feature = "test-util")]
            account_handles: Mutex::new(Vec::new()),
        })
    }
}
