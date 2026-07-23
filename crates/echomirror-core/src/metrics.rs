use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

/// Metrics collected by the EchoMirrorClient for observability
#[derive(Debug, Default)]
pub struct ClientMetrics {
    /// Total number of requests made
    pub total_requests: AtomicU64,
    /// Total number of successful requests
    pub successful_requests: AtomicU64,
    /// Total number of failed requests
    pub failed_requests: AtomicU64,
    /// Total number of retry attempts
    pub total_retries: AtomicU64,
    /// Number of times token refresh was triggered
    pub token_refresh_attempts: AtomicU64,
    /// Number of successful token refreshes
    pub token_refresh_successes: AtomicU64,
    /// Number of failed token refreshes
    pub token_refresh_failures: AtomicU64,
    /// Total time spent in backoff (milliseconds)
    pub total_backoff_ms: AtomicU64,
    /// Number of rate limit errors encountered
    pub rate_limit_errors: AtomicU64,
    /// Number of network errors encountered
    pub network_errors: AtomicU64,
    /// Number of 5xx server errors encountered
    pub server_errors: AtomicU64,
    /// Number of 4xx client errors encountered
    pub client_errors: AtomicU64,
    /// Number of auth expired errors encountered
    pub auth_expired_errors: AtomicU64,
}

impl Clone for ClientMetrics {
    fn clone(&self) -> Self {
        Self {
            total_requests: AtomicU64::new(self.total_requests.load(Ordering::Relaxed)),
            successful_requests: AtomicU64::new(self.successful_requests.load(Ordering::Relaxed)),
            failed_requests: AtomicU64::new(self.failed_requests.load(Ordering::Relaxed)),
            total_retries: AtomicU64::new(self.total_retries.load(Ordering::Relaxed)),
            token_refresh_attempts: AtomicU64::new(
                self.token_refresh_attempts.load(Ordering::Relaxed),
            ),
            token_refresh_successes: AtomicU64::new(
                self.token_refresh_successes.load(Ordering::Relaxed),
            ),
            token_refresh_failures: AtomicU64::new(
                self.token_refresh_failures.load(Ordering::Relaxed),
            ),
            total_backoff_ms: AtomicU64::new(self.total_backoff_ms.load(Ordering::Relaxed)),
            rate_limit_errors: AtomicU64::new(self.rate_limit_errors.load(Ordering::Relaxed)),
            network_errors: AtomicU64::new(self.network_errors.load(Ordering::Relaxed)),
            server_errors: AtomicU64::new(self.server_errors.load(Ordering::Relaxed)),
            client_errors: AtomicU64::new(self.client_errors.load(Ordering::Relaxed)),
            auth_expired_errors: AtomicU64::new(self.auth_expired_errors.load(Ordering::Relaxed)),
        }
    }
}

impl ClientMetrics {
    /// Create a new metrics instance
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a request attempt
    pub fn record_request(&self) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a successful request
    pub fn record_success(&self) {
        self.successful_requests.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a failed request
    pub fn record_failure(&self) {
        self.failed_requests.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a retry attempt
    pub fn record_retry(&self) {
        self.total_retries.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a token refresh attempt
    pub fn record_token_refresh_attempt(&self) {
        self.token_refresh_attempts.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a successful token refresh
    pub fn record_token_refresh_success(&self) {
        self.token_refresh_successes.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a failed token refresh
    pub fn record_token_refresh_failure(&self) {
        self.token_refresh_failures.fetch_add(1, Ordering::Relaxed);
    }

    /// Record backoff time
    pub fn record_backoff(&self, duration: Duration) {
        self.total_backoff_ms
            .fetch_add(duration.as_millis() as u64, Ordering::Relaxed);
    }

    /// Record a rate limit error
    pub fn record_rate_limit_error(&self) {
        self.rate_limit_errors.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a network error
    pub fn record_network_error(&self) {
        self.network_errors.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a server error (5xx)
    pub fn record_server_error(&self) {
        self.server_errors.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a client error (4xx)
    pub fn record_client_error(&self) {
        self.client_errors.fetch_add(1, Ordering::Relaxed);
    }

    /// Record an auth expired error
    pub fn record_auth_expired_error(&self) {
        self.auth_expired_errors.fetch_add(1, Ordering::Relaxed);
    }

    /// Get a snapshot of all metrics
    pub fn snapshot(&self) -> MetricsSnapshot {
        MetricsSnapshot {
            total_requests: self.total_requests.load(Ordering::Relaxed),
            successful_requests: self.successful_requests.load(Ordering::Relaxed),
            failed_requests: self.failed_requests.load(Ordering::Relaxed),
            total_retries: self.total_retries.load(Ordering::Relaxed),
            token_refresh_attempts: self.token_refresh_attempts.load(Ordering::Relaxed),
            token_refresh_successes: self.token_refresh_successes.load(Ordering::Relaxed),
            token_refresh_failures: self.token_refresh_failures.load(Ordering::Relaxed),
            total_backoff_ms: self.total_backoff_ms.load(Ordering::Relaxed),
            rate_limit_errors: self.rate_limit_errors.load(Ordering::Relaxed),
            network_errors: self.network_errors.load(Ordering::Relaxed),
            server_errors: self.server_errors.load(Ordering::Relaxed),
            client_errors: self.client_errors.load(Ordering::Relaxed),
            auth_expired_errors: self.auth_expired_errors.load(Ordering::Relaxed),
        }
    }

    /// Reset all metrics to zero
    pub fn reset(&self) {
        self.total_requests.store(0, Ordering::Relaxed);
        self.successful_requests.store(0, Ordering::Relaxed);
        self.failed_requests.store(0, Ordering::Relaxed);
        self.total_retries.store(0, Ordering::Relaxed);
        self.token_refresh_attempts.store(0, Ordering::Relaxed);
        self.token_refresh_successes.store(0, Ordering::Relaxed);
        self.token_refresh_failures.store(0, Ordering::Relaxed);
        self.total_backoff_ms.store(0, Ordering::Relaxed);
        self.rate_limit_errors.store(0, Ordering::Relaxed);
        self.network_errors.store(0, Ordering::Relaxed);
        self.server_errors.store(0, Ordering::Relaxed);
        self.client_errors.store(0, Ordering::Relaxed);
        self.auth_expired_errors.store(0, Ordering::Relaxed);
    }
}

/// A snapshot of metrics at a point in time
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MetricsSnapshot {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub total_retries: u64,
    pub token_refresh_attempts: u64,
    pub token_refresh_successes: u64,
    pub token_refresh_failures: u64,
    pub total_backoff_ms: u64,
    pub rate_limit_errors: u64,
    pub network_errors: u64,
    pub server_errors: u64,
    pub client_errors: u64,
    pub auth_expired_errors: u64,
}

impl MetricsSnapshot {
    /// Calculate success rate as a percentage
    pub fn success_rate(&self) -> f64 {
        if self.total_requests == 0 {
            0.0
        } else {
            (self.successful_requests as f64 / self.total_requests as f64) * 100.0
        }
    }

    /// Calculate retry rate as a percentage
    pub fn retry_rate(&self) -> f64 {
        if self.total_requests == 0 {
            0.0
        } else {
            (self.total_retries as f64 / self.total_requests as f64) * 100.0
        }
    }

    /// Calculate average backoff time in milliseconds
    pub fn average_backoff_ms(&self) -> f64 {
        if self.total_retries == 0 {
            0.0
        } else {
            self.total_backoff_ms as f64 / self.total_retries as f64
        }
    }

    /// Calculate token refresh success rate as a percentage
    pub fn token_refresh_success_rate(&self) -> f64 {
        if self.token_refresh_attempts == 0 {
            0.0
        } else {
            (self.token_refresh_successes as f64 / self.token_refresh_attempts as f64) * 100.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_recording() {
        let metrics = ClientMetrics::new();

        metrics.record_request();
        metrics.record_request();
        assert_eq!(metrics.total_requests.load(Ordering::Relaxed), 2);

        metrics.record_success();
        assert_eq!(metrics.successful_requests.load(Ordering::Relaxed), 1);

        metrics.record_failure();
        assert_eq!(metrics.failed_requests.load(Ordering::Relaxed), 1);

        metrics.record_retry();
        metrics.record_retry();
        assert_eq!(metrics.total_retries.load(Ordering::Relaxed), 2);

        metrics.record_backoff(Duration::from_millis(100));
        metrics.record_backoff(Duration::from_millis(200));
        assert_eq!(metrics.total_backoff_ms.load(Ordering::Relaxed), 300);
    }

    #[test]
    fn test_metrics_snapshot() {
        let metrics = ClientMetrics::new();

        metrics.record_request();
        metrics.record_request();
        metrics.record_success();
        metrics.record_retry();
        metrics.record_backoff(Duration::from_millis(100));

        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.total_requests, 2);
        assert_eq!(snapshot.successful_requests, 1);
        assert_eq!(snapshot.total_retries, 1);
        assert_eq!(snapshot.total_backoff_ms, 100);
    }

    #[test]
    fn test_metrics_calculations() {
        let snapshot = MetricsSnapshot {
            total_requests: 100,
            successful_requests: 95,
            failed_requests: 5,
            total_retries: 10,
            token_refresh_attempts: 2,
            token_refresh_successes: 2,
            token_refresh_failures: 0,
            total_backoff_ms: 500,
            rate_limit_errors: 3,
            network_errors: 2,
            server_errors: 3,
            client_errors: 2,
            auth_expired_errors: 2,
        };

        assert_eq!(snapshot.success_rate(), 95.0);
        assert_eq!(snapshot.retry_rate(), 10.0);
        assert_eq!(snapshot.average_backoff_ms(), 50.0);
        assert_eq!(snapshot.token_refresh_success_rate(), 100.0);
    }

    #[test]
    fn test_metrics_reset() {
        let metrics = ClientMetrics::new();

        metrics.record_request();
        metrics.record_success();
        metrics.record_retry();

        metrics.reset();

        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.total_requests, 0);
        assert_eq!(snapshot.successful_requests, 0);
        assert_eq!(snapshot.total_retries, 0);
    }

    #[test]
    fn test_metrics_clone() {
        let metrics = ClientMetrics::new();

        metrics.record_request();
        metrics.record_success();

        let cloned = metrics.clone();

        metrics.record_request();

        let original_snapshot = metrics.snapshot();
        let cloned_snapshot = cloned.snapshot();

        assert_eq!(original_snapshot.total_requests, 2);
        assert_eq!(cloned_snapshot.total_requests, 1);
    }
}
