use crate::config::{CircuitBreakerConfig, CircuitState};
use crate::error::{EchoMirrorError, Result};
use crate::metrics::ClientMetrics;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

#[derive(Debug)]
struct CircuitBreakerState {
    consecutive_failures: u32,
    state: CircuitState,
    opened_at: Option<Instant>,
    probing: bool,
}

/// Thread-safe circuit breaker shared across requests on an `EchoMirrorClient`.
#[derive(Debug)]
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    metrics: Arc<ClientMetrics>,
    state: RwLock<CircuitBreakerState>,
}

impl CircuitBreaker {
    pub fn new(config: CircuitBreakerConfig, metrics: Arc<ClientMetrics>) -> Self {
        metrics.record_circuit_state(CircuitState::Closed);
        Self {
            config,
            metrics,
            state: RwLock::new(CircuitBreakerState {
                consecutive_failures: 0,
                state: CircuitState::Closed,
                opened_at: None,
                probing: false,
            }),
        }
    }

    pub fn config(&self) -> &CircuitBreakerConfig {
        &self.config
    }

    /// Check circuit status before attempting a request.
    /// Returns Ok(is_probe) if request is permitted to proceed,
    /// or Err(EchoMirrorError::CircuitOpen) if blocked.
    pub async fn before_request(&self) -> Result<bool> {
        if !self.config.enabled {
            return Ok(false);
        }

        let mut lock = self.state.write().await;
        match lock.state {
            CircuitState::Closed => Ok(false),
            CircuitState::Open => {
                if let Some(opened_at) = lock.opened_at {
                    if opened_at.elapsed() >= self.config.cooldown {
                        // Transition to HalfOpen and allow this request as a probe
                        lock.state = CircuitState::HalfOpen;
                        lock.probing = true;
                        self.metrics.record_circuit_state(CircuitState::HalfOpen);
                        return Ok(true);
                    }
                }
                self.metrics.record_circuit_open_rejection();
                Err(EchoMirrorError::CircuitOpen(
                    "Circuit breaker is open: requests blocked during cooldown".to_string(),
                ))
            }
            CircuitState::HalfOpen => {
                if !lock.probing {
                    lock.probing = true;
                    Ok(true)
                } else {
                    self.metrics.record_circuit_open_rejection();
                    Err(EchoMirrorError::CircuitOpen(
                        "Circuit breaker is half-open: probe request in flight".to_string(),
                    ))
                }
            }
        }
    }

    /// Called when a request successfully completes.
    pub async fn on_success(&self, was_probe: bool) {
        if !self.config.enabled {
            return;
        }

        let mut lock = self.state.write().await;
        if was_probe || lock.state != CircuitState::Closed {
            lock.state = CircuitState::Closed;
            lock.consecutive_failures = 0;
            lock.opened_at = None;
            lock.probing = false;
            self.metrics.record_circuit_state(CircuitState::Closed);
        } else {
            lock.consecutive_failures = 0;
        }
    }

    /// Called when a failure occurs.
    pub async fn on_failure(&self, is_backend_failure: bool, was_probe: bool) {
        if !self.config.enabled || !is_backend_failure {
            if was_probe {
                let mut lock = self.state.write().await;
                lock.probing = false;
            }
            return;
        }

        let mut lock = self.state.write().await;
        lock.consecutive_failures += 1;
        let should_trip = lock.state == CircuitState::HalfOpen
            || lock.consecutive_failures >= self.config.failure_threshold;

        if should_trip {
            lock.state = CircuitState::Open;
            lock.opened_at = Some(Instant::now());
            lock.probing = false;
            self.metrics.record_circuit_trip();
            self.metrics.record_circuit_state(CircuitState::Open);
        } else if was_probe {
            lock.probing = false;
        }
    }

    /// Read current circuit state
    pub async fn state(&self) -> CircuitState {
        self.state.read().await.state
    }

    /// Manually reset circuit breaker to closed state
    pub async fn reset(&self) {
        let mut lock = self.state.write().await;
        lock.consecutive_failures = 0;
        lock.state = CircuitState::Closed;
        lock.opened_at = None;
        lock.probing = false;
        self.metrics.record_circuit_state(CircuitState::Closed);
    }
}
