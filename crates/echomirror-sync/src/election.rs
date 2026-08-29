use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::Instant;

/// Distributed leader-election backend so only one [`crate::SyncEngine`]
/// instance actively streams a given account when horizontally scaled.
///
/// Implementations model a renewable lease keyed per-account, analogous to a
/// Redis `SET NX EX` or a Postgres row-level lease: `try_acquire` both
/// acquires an unheld/expired lease and renews one already held by
/// `holder_id`. A crashed holder that stops renewing simply has its lease
/// expire naturally — no clean release required for another instance to take
/// over (see [`LeaderElector::release`] for the cooperative path).
#[async_trait]
pub trait LeaderElector: Send + Sync {
    /// Attempt to acquire or renew the per-account lease for `holder_id`,
    /// valid for `ttl` from now. Returns `Ok(true)` if `holder_id` holds the
    /// lease after this call, `Ok(false)` if another holder's lease is still
    /// active.
    async fn try_acquire(
        &self,
        account: &str,
        holder_id: &str,
        ttl: Duration,
    ) -> echomirror_core::Result<bool>;

    /// Cooperatively give up the lease on clean shutdown. A no-op if
    /// `holder_id` doesn't currently hold it (already expired or lost to
    /// another instance) — always safe to call.
    async fn release(&self, account: &str, holder_id: &str) -> echomirror_core::Result<()>;
}

struct Lease {
    holder_id: String,
    expires_at: Instant,
}

/// In-process [`LeaderElector`] — the default. Coordinates engine instances
/// that share the *same* `Arc<SingleProcessElector>` (e.g. in tests), but
/// each independently-constructed instance has its own private lease table,
/// so it provides no coordination across OS processes.
///
/// For real horizontal scaling, plug in a shared backend (e.g.
/// [`crate::postgres::PgLeaderElector`]) the same way you would swap in a
/// shared [`crate::CursorStore`].
pub struct SingleProcessElector {
    leases: Arc<RwLock<HashMap<String, Lease>>>,
}

impl SingleProcessElector {
    pub fn new() -> Self {
        Self {
            leases: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

impl Default for SingleProcessElector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LeaderElector for SingleProcessElector {
    async fn try_acquire(
        &self,
        account: &str,
        holder_id: &str,
        ttl: Duration,
    ) -> echomirror_core::Result<bool> {
        let mut leases = self.leases.write().await;
        let now = Instant::now();
        let acquire = match leases.get(account) {
            Some(lease) => lease.holder_id == holder_id || lease.expires_at <= now,
            None => true,
        };
        if acquire {
            leases.insert(
                account.to_string(),
                Lease {
                    holder_id: holder_id.to_string(),
                    expires_at: now + ttl,
                },
            );
        }
        Ok(acquire)
    }

    async fn release(&self, account: &str, holder_id: &str) -> echomirror_core::Result<()> {
        let mut leases = self.leases.write().await;
        if let Some(lease) = leases.get(account) {
            if lease.holder_id == holder_id {
                leases.remove(account);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn uncontended_acquire_succeeds() {
        let elector = SingleProcessElector::new();
        assert!(elector
            .try_acquire("acct", "a", Duration::from_secs(5))
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn second_holder_denied_while_lease_active() {
        let elector = SingleProcessElector::new();
        assert!(elector
            .try_acquire("acct", "a", Duration::from_secs(5))
            .await
            .unwrap());
        assert!(!elector
            .try_acquire("acct", "b", Duration::from_secs(5))
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn holder_can_renew_its_own_lease() {
        let elector = SingleProcessElector::new();
        assert!(elector
            .try_acquire("acct", "a", Duration::from_millis(50))
            .await
            .unwrap());
        assert!(elector
            .try_acquire("acct", "a", Duration::from_millis(50))
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn expired_lease_can_be_taken_over() {
        let elector = SingleProcessElector::new();
        assert!(elector
            .try_acquire("acct", "a", Duration::from_millis(20))
            .await
            .unwrap());
        tokio::time::sleep(Duration::from_millis(40)).await;
        assert!(elector
            .try_acquire("acct", "b", Duration::from_secs(5))
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn release_only_clears_own_lease() {
        let elector = SingleProcessElector::new();
        elector
            .try_acquire("acct", "a", Duration::from_secs(5))
            .await
            .unwrap();
        // "b" never held it — releasing must be a no-op, not steal/clear it.
        elector.release("acct", "b").await.unwrap();
        assert!(!elector
            .try_acquire("acct", "b", Duration::from_secs(5))
            .await
            .unwrap());

        elector.release("acct", "a").await.unwrap();
        assert!(elector
            .try_acquire("acct", "b", Duration::from_secs(5))
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn leases_are_independent_per_account() {
        let elector = SingleProcessElector::new();
        assert!(elector
            .try_acquire("acct-1", "a", Duration::from_secs(5))
            .await
            .unwrap());
        assert!(elector
            .try_acquire("acct-2", "b", Duration::from_secs(5))
            .await
            .unwrap());
    }
}
