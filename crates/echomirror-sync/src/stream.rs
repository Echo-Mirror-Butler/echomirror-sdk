use crate::metrics::SyncMetrics;
use echomirror_core::SyncEvent;
use std::sync::Arc;
use tokio::sync::broadcast;

/// Typed wrapper around a broadcast receiver for sync events.
pub struct SyncEventStream {
    inner: broadcast::Receiver<SyncEvent>,
    metrics: Option<Arc<SyncMetrics>>,
}

impl SyncEventStream {
    pub fn new(rx: broadcast::Receiver<SyncEvent>) -> Self {
        Self {
            inner: rx,
            metrics: None,
        }
    }

    pub fn new_with_metrics(rx: broadcast::Receiver<SyncEvent>, metrics: Arc<SyncMetrics>) -> Self {
        Self {
            inner: rx,
            metrics: Some(metrics),
        }
    }

    pub fn with_metrics(mut self, metrics: Arc<SyncMetrics>) -> Self {
        self.metrics = Some(metrics);
        self
    }

    pub async fn recv(&mut self) -> Result<SyncEvent, broadcast::error::RecvError> {
        match self.inner.recv().await {
            Ok(event) => Ok(event),
            Err(broadcast::error::RecvError::Lagged(n)) => {
                if let Some(metrics) = &self.metrics {
                    metrics.record_lag(n);
                }
                tracing::warn!(missed = n, "sync event stream lagged");
                Ok(SyncEvent::GapDetected { missed_count: n })
            }
            Err(broadcast::error::RecvError::Closed) => Err(broadcast::error::RecvError::Closed),
        }
    }

    /// Consume events until the closure returns false or the stream ends.
    pub async fn for_each<F>(&mut self, mut f: F)
    where
        F: FnMut(SyncEvent) -> bool,
    {
        loop {
            match self.inner.recv().await {
                Ok(event) => {
                    if !f(event) {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    if let Some(metrics) = &self.metrics {
                        metrics.record_lag(n);
                    }
                    tracing::warn!(missed = n, "sync event stream lagged");
                    if !f(SyncEvent::GapDetected { missed_count: n }) {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    }
}
