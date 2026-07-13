use echomirror_core::SyncEvent;
use tokio::sync::broadcast;

/// Typed wrapper around a broadcast receiver for sync events.
pub struct SyncEventStream {
    inner: broadcast::Receiver<SyncEvent>,
}

impl SyncEventStream {
    pub fn new(rx: broadcast::Receiver<SyncEvent>) -> Self {
        Self { inner: rx }
    }

    pub async fn recv(&mut self) -> Result<SyncEvent, broadcast::error::RecvError> {
        self.inner.recv().await
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
                    eprintln!("echomirror-sync: stream lagged by {} messages", n);
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    }
}
