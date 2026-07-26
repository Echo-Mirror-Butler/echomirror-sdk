//! A minimal scriptable Horizon stand-in for deterministic sync-engine tests.
//!
//! Routes on the `Accept` header: `text/event-stream` requests get a live SSE
//! connection the test can push frames into (or forcibly drop); everything
//! else gets a canned JSON payment page keyed by the request's `cursor` query
//! parameter. All requests are logged so tests can assert resume cursors.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;

#[derive(Clone)]
enum SseDirective {
    Frame(String),
    Drop,
}

#[derive(Default)]
struct FixtureState {
    /// cursor query value → full JSON page body
    pages: Mutex<HashMap<String, serde_json::Value>>,
    /// "SSE <path?query>" or "GET <path?query>" per request, in arrival order
    requests: Mutex<Vec<String>>,
    sse_conns: Mutex<Vec<mpsc::UnboundedSender<SseDirective>>>,
}

pub struct HorizonFixture {
    addr: SocketAddr,
    state: Arc<FixtureState>,
}

impl HorizonFixture {
    pub async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("local addr");
        let state = Arc::new(FixtureState::default());
        let accept_state = state.clone();
        tokio::spawn(async move {
            while let Ok((socket, _)) = listener.accept().await {
                tokio::spawn(handle_connection(socket, accept_state.clone()));
            }
        });
        Self { addr, state }
    }

    pub fn base_url(&self) -> String {
        format!("http://{}", self.addr)
    }

    /// Serve `records` as the payment page for requests with this `cursor`
    /// value. Unknown cursors get an empty page.
    pub fn set_page(&self, cursor: &str, records: Vec<serde_json::Value>) {
        self.state.pages.lock().unwrap().insert(
            cursor.to_string(),
            serde_json::json!({ "_embedded": { "records": records } }),
        );
    }

    /// Push one record to every live SSE connection.
    pub fn push_event(&self, record: &serde_json::Value) {
        self.broadcast(SseDirective::Frame(format!("data: {record}\n\n")));
    }

    /// Push an SSE heartbeat comment to every live connection.
    pub fn push_heartbeat(&self) {
        self.broadcast(SseDirective::Frame(":\n\n".to_string()));
    }

    /// Forcibly close every live SSE connection (simulates a stream drop).
    pub fn drop_connections(&self) {
        let mut conns = self.state.sse_conns.lock().unwrap();
        for conn in conns.drain(..) {
            let _ = conn.send(SseDirective::Drop);
        }
    }

    pub fn sse_connection_count(&self) -> usize {
        let mut conns = self.state.sse_conns.lock().unwrap();
        conns.retain(|conn| !conn.is_closed());
        conns.len()
    }

    /// Wait until at least `n` SSE connections are live (10s cap).
    pub async fn wait_for_sse_connections(&self, n: usize) {
        for _ in 0..200 {
            if self.sse_connection_count() >= n {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        panic!("timed out waiting for {n} SSE connection(s)");
    }

    /// All requests seen so far, e.g. `"GET /accounts/GA/payments?cursor=5..."`.
    pub fn requests(&self) -> Vec<String> {
        self.state.requests.lock().unwrap().clone()
    }

    fn broadcast(&self, directive: SseDirective) {
        for conn in self.state.sse_conns.lock().unwrap().iter() {
            let _ = conn.send(directive.clone());
        }
    }
}

async fn handle_connection(mut socket: TcpStream, state: Arc<FixtureState>) {
    // Read the request head (GET requests carry no body).
    let mut head = Vec::new();
    let mut chunk = [0u8; 1024];
    while !head.windows(4).any(|w| w == b"\r\n\r\n") {
        match socket.read(&mut chunk).await {
            Ok(0) | Err(_) => return,
            Ok(n) => head.extend_from_slice(&chunk[..n]),
        }
        if head.len() > 65536 {
            return;
        }
    }
    let head = String::from_utf8_lossy(&head).to_string();
    let path_query = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/")
        .to_string();
    let is_sse = head.to_ascii_lowercase().contains("text/event-stream");

    state.requests.lock().unwrap().push(format!(
        "{} {}",
        if is_sse { "SSE" } else { "GET" },
        path_query
    ));

    if is_sse {
        let (tx, mut rx) = mpsc::unbounded_channel();
        state.sse_conns.lock().unwrap().push(tx);

        let header = b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncache-control: no-cache\r\n\r\n";
        if socket.write_all(header).await.is_err() {
            return;
        }
        let hello = b"retry: 1000\nevent: open\ndata: \"hello\"\n\n";
        if socket.write_all(hello).await.is_err() {
            return;
        }
        let _ = socket.flush().await;

        while let Some(directive) = rx.recv().await {
            match directive {
                SseDirective::Frame(frame) => {
                    if socket.write_all(frame.as_bytes()).await.is_err() {
                        break;
                    }
                    let _ = socket.flush().await;
                }
                SseDirective::Drop => break,
            }
        }
        // Socket drops here → the client sees EOF.
    } else {
        let cursor = path_query
            .split("cursor=")
            .nth(1)
            .map(|rest| rest.split('&').next().unwrap_or("").to_string())
            .unwrap_or_default();
        let body = state
            .pages
            .lock()
            .unwrap()
            .get(&cursor)
            .cloned()
            .unwrap_or_else(|| serde_json::json!({ "_embedded": { "records": [] } }))
            .to_string();
        let response = format!(
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = socket.write_all(response.as_bytes()).await;
        let _ = socket.flush().await;
    }
}
