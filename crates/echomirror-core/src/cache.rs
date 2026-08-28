use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Which HTTP conditional header should be sent with a cached validator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheValidatorKind {
    ETag,
    LastModified,
}

/// A single cached HTTP response entry.
#[derive(Debug, Clone)]
pub struct CacheEntry {
    /// The `ETag` or `Last-Modified` value from the server.
    pub validator: String,
    /// Whether `validator` belongs in `If-None-Match` or `If-Modified-Since`.
    pub validator_kind: CacheValidatorKind,
    /// The serialized response body bytes.
    pub body: Vec<u8>,
    /// When this entry was stored.
    pub stored_at: Instant,
}

/// Configuration for the response cache.
#[derive(Debug, Clone)]
pub struct CacheConfig {
    /// Whether caching is enabled (default: false — opt-in).
    pub enabled: bool,
    /// Maximum number of entries before LRU eviction kicks in (default: 256).
    pub max_entries: usize,
    /// Time-to-live for cached entries (default: 5 minutes).
    pub ttl: Duration,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            max_entries: 256,
            ttl: Duration::from_secs(300),
        }
    }
}

/// In-memory response cache with LRU eviction.
///
/// Keys are request URLs. Only GET responses are cached.
#[derive(Debug, Clone)]
pub struct ResponseCache {
    inner: Arc<RwLock<CacheInner>>,
    config: CacheConfig,
}

#[derive(Debug)]
struct CacheInner {
    entries: HashMap<String, CacheEntry>,
    /// Access order for LRU eviction (stores keys in order of last access).
    access_order: Vec<String>,
}

impl ResponseCache {
    /// Create a new cache with the given configuration.
    pub fn new(config: CacheConfig) -> Self {
        Self {
            inner: Arc::new(RwLock::new(CacheInner {
                entries: HashMap::new(),
                access_order: Vec::new(),
            })),
            config,
        }
    }

    /// Look up a cached response by URL. Returns `(validator, body)` if a
    /// valid (non-expired) entry exists, `None` otherwise.
    pub async fn get(&self, url: &str) -> Option<(String, Vec<u8>)> {
        self.get_entry(url)
            .await
            .map(|entry| (entry.validator, entry.body))
    }

    /// Look up the full cache entry, including the validator type needed to
    /// construct the correct conditional request header.
    pub async fn get_entry(&self, url: &str) -> Option<CacheEntry> {
        if !self.config.enabled {
            return None;
        }

        let mut inner = self.inner.write().await;
        let entry = inner.entries.get(url)?;

        if entry.stored_at.elapsed() > self.config.ttl {
            // Expired — evict.
            inner.entries.remove(url);
            inner.access_order.retain(|k| *k != url);
            return None;
        }

        // Clone the entry before mutating access_order.
        let result = entry.clone();

        // Move to end of access_order (most recently used).
        inner.access_order.retain(|k| *k != url);
        inner.access_order.push(url.to_string());

        Some(result)
    }

    /// Store an ETag response in the cache. Returns whether an LRU entry was
    /// evicted to make room for this response.
    pub async fn put(&self, url: String, validator: String, body: Vec<u8>) -> bool {
        self.put_with_validator(url, validator, CacheValidatorKind::ETag, body)
            .await
    }

    /// Store a response together with its conditional-validator type. Returns
    /// whether an LRU entry was evicted to make room for this response.
    pub async fn put_with_validator(
        &self,
        url: String,
        validator: String,
        validator_kind: CacheValidatorKind,
        body: Vec<u8>,
    ) -> bool {
        // A zero-capacity cache is valid configuration and deliberately stores
        // nothing rather than accidentally retaining one entry forever.
        if !self.config.enabled || self.config.max_entries == 0 {
            return false;
        }

        let mut inner = self.inner.write().await;

        // If already present, update in place.
        if inner.entries.contains_key(&url) {
            inner.access_order.retain(|k| *k != url);
            inner.entries.insert(
                url.clone(),
                CacheEntry {
                    validator,
                    validator_kind,
                    body,
                    stored_at: Instant::now(),
                },
            );
            inner.access_order.push(url);
            return false;
        }

        // Evict LRU entries if at capacity.
        let mut evicted = false;
        while inner.entries.len() >= self.config.max_entries {
            if let Some(oldest) = inner.access_order.first().cloned() {
                inner.entries.remove(&oldest);
                inner.access_order.remove(0);
                evicted = true;
            } else {
                break;
            }
        }

        inner.entries.insert(
            url.clone(),
            CacheEntry {
                validator,
                validator_kind,
                body,
                stored_at: Instant::now(),
            },
        );
        inner.access_order.push(url);
        evicted
    }

    /// Invalidate (remove) a cached entry by URL.
    pub async fn invalidate(&self, url: &str) {
        let mut inner = self.inner.write().await;
        inner.entries.remove(url);
        inner.access_order.retain(|k| *k != url);
    }

    /// Clear all cached entries.
    pub async fn clear(&self) {
        let mut inner = self.inner.write().await;
        inner.entries.clear();
        inner.access_order.clear();
    }

    /// Return the number of entries currently in the cache.
    pub async fn len(&self) -> usize {
        self.inner.read().await.entries.len()
    }

    /// Returns true if the cache is empty.
    pub async fn is_empty(&self) -> bool {
        self.inner.read().await.entries.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_disabled_cache_returns_none() {
        let cache = ResponseCache::new(CacheConfig {
            enabled: false,
            ..Default::default()
        });
        assert!(cache.get("http://example.com").await.is_none());
    }

    #[tokio::test]
    async fn test_put_and_get() {
        let cache = ResponseCache::new(CacheConfig {
            enabled: true,
            max_entries: 10,
            ttl: Duration::from_secs(60),
        });

        cache
            .put(
                "http://example.com/data".to_string(),
                "abc123".to_string(),
                b"response body".to_vec(),
            )
            .await;

        let result = cache.get("http://example.com/data").await;
        assert!(result.is_some());
        let (validator, body) = result.unwrap();
        assert_eq!(validator, "abc123");
        assert_eq!(body, b"response body");
    }

    #[tokio::test]
    async fn test_expired_entry() {
        let cache = ResponseCache::new(CacheConfig {
            enabled: true,
            max_entries: 10,
            ttl: Duration::from_millis(1),
        });

        cache
            .put(
                "http://example.com/data".to_string(),
                "abc".to_string(),
                b"body".to_vec(),
            )
            .await;

        // Wait for TTL to expire.
        tokio::time::sleep(Duration::from_millis(10)).await;

        assert!(cache.get("http://example.com/data").await.is_none());
    }

    #[tokio::test]
    async fn test_lru_eviction() {
        let cache = ResponseCache::new(CacheConfig {
            enabled: true,
            max_entries: 2,
            ttl: Duration::from_secs(60),
        });

        cache.put("/a".to_string(), "va".to_string(), vec![]).await;
        cache.put("/b".to_string(), "vb".to_string(), vec![]).await;

        // Access /a to make it most recently used.
        cache.get("/a").await;

        // Adding /c should evict /b (LRU).
        cache.put("/c".to_string(), "vc".to_string(), vec![]).await;

        assert!(cache.get("/b").await.is_none());
        assert!(cache.get("/a").await.is_some());
        assert!(cache.get("/c").await.is_some());
    }

    #[tokio::test]
    async fn test_invalidate() {
        let cache = ResponseCache::new(CacheConfig {
            enabled: true,
            ..Default::default()
        });

        cache.put("/x".to_string(), "v".to_string(), vec![]).await;
        assert!(cache.get("/x").await.is_some());

        cache.invalidate("/x").await;
        assert!(cache.get("/x").await.is_none());
    }

    #[tokio::test]
    async fn test_clear() {
        let cache = ResponseCache::new(CacheConfig {
            enabled: true,
            ..Default::default()
        });

        cache.put("/a".to_string(), "v".to_string(), vec![]).await;
        cache.put("/b".to_string(), "v".to_string(), vec![]).await;
        assert_eq!(cache.len().await, 2);

        cache.clear().await;
        assert!(cache.is_empty().await);
    }

    #[tokio::test]
    async fn zero_capacity_does_not_retain_entries() {
        let cache = ResponseCache::new(CacheConfig {
            enabled: true,
            max_entries: 0,
            ..Default::default()
        });

        assert!(!cache.put("/a".to_string(), "v".to_string(), vec![]).await);
        assert!(cache.is_empty().await);
    }

    #[tokio::test]
    async fn preserves_last_modified_validator_type() {
        let cache = ResponseCache::new(CacheConfig {
            enabled: true,
            ..Default::default()
        });
        cache
            .put_with_validator(
                "/a".to_string(),
                "Wed, 21 Oct 2015 07:28:00 GMT".to_string(),
                CacheValidatorKind::LastModified,
                vec![],
            )
            .await;

        let entry = cache.get_entry("/a").await.expect("cached entry");
        assert_eq!(entry.validator_kind, CacheValidatorKind::LastModified);
    }
}
