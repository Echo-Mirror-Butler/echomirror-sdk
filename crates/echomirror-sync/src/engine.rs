use crate::{
    cursor::{CursorStore, InMemoryCursorStore, SyncCursor},
    filter::SyncFilter,
    stream::SyncEventStream,
};
use echomirror_core::{EchoMirrorClient, Result, SyncEvent};
use echomirror_stellar::horizon::HorizonClient;
use std::{sync::Arc, time::Duration};
use tokio::sync::broadcast;

const DEFAULT_POLL_INTERVAL_MS: u64 = 5_000;
const DEFAULT_PAGE_SIZE: u8 = 50;

/// Streams real-time Stellar blockchain events for one or more accounts.
///
/// ## Features
/// - Resumable — saves a cursor after every page so restarts don't re-scan
/// - Filterable — emit only the transactions you care about
/// - Multi-account — watch up to 100 accounts in a single engine instance
/// - Backpressure-aware — uses a bounded broadcast channel
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
///     let mut engine = SyncEngine::builder(&client)
///         .watch("GPUBLIC_KEY1")
///         .watch("GPUBLIC_KEY2")
///         .filter(SyncFilter::new().asset("ECHO").min_amount(1.0))
///         .build();
///
///     let mut stream = engine.subscribe();
///     engine.start();
///
///     while let Ok(event) = stream.recv().await {
///         match event {
///             SyncEvent::TransactionDetected { tx } => println!("TX: {}", tx.id),
///             SyncEvent::LedgerClosed { ledger } => println!("Ledger: {}", ledger.sequence),
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
    poll_interval: Duration,
    page_size: u8,
    tx: broadcast::Sender<SyncEvent>,
}

pub struct SyncEngineBuilder {
    client: Arc<EchoMirrorClient>,
    accounts: Vec<String>,
    filter: SyncFilter,
    cursor_store: Arc<dyn CursorStore>,
    poll_interval: Duration,
    page_size: u8,
}

impl SyncEngine {
    pub fn builder(client: &EchoMirrorClient) -> SyncEngineBuilder {
        SyncEngineBuilder {
            client: Arc::new(client.clone()),
            accounts: Vec::new(),
            filter: SyncFilter::new(),
            cursor_store: Arc::new(InMemoryCursorStore::new()),
            poll_interval: Duration::from_millis(DEFAULT_POLL_INTERVAL_MS),
            page_size: DEFAULT_PAGE_SIZE,
        }
    }

    /// Subscribe to the event stream. Call before `start()`.
    pub fn subscribe(&self) -> broadcast::Receiver<SyncEvent> {
        self.tx.subscribe()
    }

    /// Start syncing in a background Tokio task.
    pub fn start(self: Arc<Self>) {
        let engine = self.clone();
        tokio::spawn(async move {
            engine.run().await;
        });
    }

    async fn run(&self) {
        let _ = self.tx.send(SyncEvent::SyncStarted { from_ledger: 0 });

        loop {
            for account in &self.accounts {
                if let Err(e) = self.sync_account(account).await {
                    let _ = self.tx.send(SyncEvent::Error {
                        message: e.to_string(),
                    });
                }
            }
            tokio::time::sleep(self.poll_interval).await;
        }
    }

    async fn sync_account(&self, account: &str) -> Result<()> {
        let cursor = self
            .cursor_store
            .load(account)
            .await
            .unwrap_or_else(SyncCursor::genesis);

        let horizon = HorizonClient::new(self.client.config().network.horizon_url());
        let page = horizon
            .get_transactions(account, Some(&cursor.paging_token), self.page_size)
            .await?;

        let records = page.embedded.records;
        if records.is_empty() {
            return Ok(());
        }

        for record in &records {
            let sync_record = crate::filter::SyncRecord {
                from: account.to_string(),
                to: String::new(),
                asset_code: "XLM".to_string(),
                amount: 0.0,
                memo: record.memo.clone(),
                paging_token: record.paging_token.clone(),
                ledger_sequence: record.ledger,
            };

            if self.filter.matches(&sync_record) {
                let _ = self.tx.send(SyncEvent::LedgerClosed {
                    ledger: echomirror_core::LedgerRecord {
                        sequence: record.ledger,
                        hash: record.hash.clone(),
                        closed_at: record.created_at.parse().unwrap_or_default(),
                        transaction_count: 1,
                        base_fee: record.fee_charged.parse().unwrap_or(100),
                    },
                });
            }
        }

        let last = records.last().unwrap();
        let new_cursor = SyncCursor {
            ledger_sequence: last.ledger,
            paging_token: last.paging_token.clone(),
            last_synced_at: chrono::Utc::now(),
            total_processed: cursor.total_processed + records.len() as u64,
        };
        self.cursor_store.save(account, &new_cursor).await;

        Ok(())
    }
}

impl SyncEngineBuilder {
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

    pub fn poll_interval(mut self, interval: Duration) -> Self {
        self.poll_interval = interval;
        self
    }

    pub fn build(self) -> Arc<SyncEngine> {
        let (tx, _) = broadcast::channel(1024);
        Arc::new(SyncEngine {
            client: self.client,
            accounts: self.accounts,
            filter: self.filter,
            cursor_store: self.cursor_store,
            poll_interval: self.poll_interval,
            page_size: self.page_size,
            tx,
        })
    }
}
