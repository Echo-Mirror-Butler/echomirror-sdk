/// Rules for filtering which transactions the sync engine emits events for.
#[derive(Debug, Clone, Default)]
pub struct SyncFilter {
    pub rules: Vec<FilterRule>,
}

#[derive(Debug, Clone)]
pub enum FilterRule {
    /// Only emit events for transactions involving this public key
    Account(String),
    /// Only emit events for a specific asset (e.g. "ECHO", "XLM")
    Asset(String),
    /// Only emit events where amount >= threshold (in base units)
    MinAmount(f64),
    /// Only emit events with a specific memo prefix
    MemoPrefix(String),
}

impl SyncFilter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn account(mut self, public_key: impl Into<String>) -> Self {
        self.rules.push(FilterRule::Account(public_key.into()));
        self
    }

    pub fn asset(mut self, asset_code: impl Into<String>) -> Self {
        self.rules.push(FilterRule::Asset(asset_code.into()));
        self
    }

    pub fn min_amount(mut self, amount: f64) -> Self {
        self.rules.push(FilterRule::MinAmount(amount));
        self
    }

    pub fn memo_prefix(mut self, prefix: impl Into<String>) -> Self {
        self.rules.push(FilterRule::MemoPrefix(prefix.into()));
        self
    }

    /// Returns true if this transaction record passes all filter rules.
    pub fn matches(&self, record: &SyncRecord) -> bool {
        self.rules.iter().all(|rule| match rule {
            FilterRule::Account(key) => record.from == *key || record.to == *key,
            FilterRule::Asset(code) => record.asset_code == *code,
            FilterRule::MinAmount(min) => record.amount >= *min,
            FilterRule::MemoPrefix(prefix) => record
                .memo
                .as_deref()
                .map(|m| m.starts_with(prefix.as_str()))
                .unwrap_or(false),
        })
    }
}

/// Minimal transaction record used for filter matching during sync
#[derive(Debug, Clone)]
pub struct SyncRecord {
    pub from: String,
    pub to: String,
    pub asset_code: String,
    pub amount: f64,
    pub memo: Option<String>,
    pub paging_token: String,
    pub ledger_sequence: u32,
}
