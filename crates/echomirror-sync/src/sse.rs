use echomirror_core::{EchoMirrorError, Result};
use eventsource_stream::{EventStreamError, Eventsource};
use futures::{Stream, StreamExt};
use std::pin::Pin;
use std::time::Duration;

/// One parsed SSE frame: the event name (Horizon uses `open`, `close`, and the
/// default `message`) and its data payload.
#[derive(Debug, Clone)]
pub struct SseMessage {
    pub event: String,
    pub data: String,
}

pub type SseStream = Pin<Box<dyn Stream<Item = Result<SseMessage>> + Send>>;

/// Build the HTTP client used for SSE connections.
///
/// Deliberately has only a *connect* timeout — a total request timeout would
/// kill every long-lived stream. Liveness is instead enforced by the idle
/// timeout in [`open_sse_stream`], which Horizon's periodic heartbeat comments
/// keep resetting.
pub fn sse_http_client(connect_timeout: Duration) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(connect_timeout)
        .tcp_keepalive(Duration::from_secs(30))
        .build()
        .map_err(EchoMirrorError::Network)
}

/// Open a Server-Sent Events stream against `url`.
///
/// The idle timeout is applied at the bytes layer, *before* SSE parsing, so
/// heartbeat comment lines (which the parser swallows) still reset it. When no
/// bytes arrive for `idle_timeout` the stream yields an error, which the
/// engine treats as a drop and reconnects.
pub async fn open_sse_stream(
    http: &reqwest::Client,
    url: &str,
    idle_timeout: Duration,
) -> Result<SseStream> {
    let res = http
        .get(url)
        .header("accept", "text/event-stream")
        .send()
        .await
        .map_err(EchoMirrorError::Network)?;

    if !res.status().is_success() {
        return Err(EchoMirrorError::Http {
            status: res.status().as_u16(),
            message: res.text().await.unwrap_or_default(),
        });
    }

    let bytes =
        tokio_stream::StreamExt::timeout(res.bytes_stream(), idle_timeout).map(move |item| {
            match item {
                Ok(Ok(chunk)) => Ok(chunk),
                Ok(Err(e)) => Err(EchoMirrorError::Network(e)),
                Err(_elapsed) => Err(EchoMirrorError::Sync(format!(
                    "SSE stream idle for more than {idle_timeout:?} (no heartbeat)"
                ))),
            }
        });

    let events = bytes.eventsource().map(|item| match item {
        Ok(ev) => Ok(SseMessage {
            event: ev.event,
            data: ev.data,
        }),
        Err(EventStreamError::Transport(e)) => Err(e),
        Err(other) => Err(EchoMirrorError::Sync(format!("SSE parse error: {other}"))),
    });

    Ok(Box::pin(events))
}

/// URL of the payments SSE/backfill endpoint for one account.
pub fn payments_url(
    base_url: &str,
    account: &str,
    cursor: &str,
    join_transactions: bool,
) -> String {
    let mut url = format!("{base_url}/accounts/{account}/payments?cursor={cursor}");
    if join_transactions {
        url.push_str("&join=transactions");
    }
    url
}

/// URL of the ledgers SSE endpoint (live tail only).
pub fn ledgers_url(base_url: &str) -> String {
    format!("{base_url}/ledgers?cursor=now")
}
