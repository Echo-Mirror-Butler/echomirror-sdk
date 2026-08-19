//! EchoMirror contract-test runner (Rust / core bindings).
//!
//! Reads the shared `contract-tests/contract-spec.json` and drives the real
//! `echomirror_core` mood + social bindings against the docker-compose fixture
//! (`fixture-api` on 127.0.0.1:18080). Each operation is asserted through the
//! typed deserialization path so type drift (renamed fields, wrong shapes) is
//! caught — not just raw HTTP.
//!
//! The suite self-skips when the fixture is not reachable, so `cargo test` in
//! the crate keeps passing without the fixture running.
//!
//! Env overrides:
//!   ECHOMIRROR_CONTRACT_SPEC    path to contract-spec.json
//!   ECHOMIRROR_CONTRACT_API_BASE    e.g. http://127.0.0.1:18080

use std::io::Read;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use echomirror_core::{
    get_global_feed, get_leaderboard, get_mood_streak, get_mood_summary, log_mood,
    EchoMirrorClient, EchoMirrorConfig, LogMoodPayload,
};
use serde_json::{json, Value};

const DEFAULT_SPEC: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contract-tests/contract-spec.json"
);

fn api_base() -> String {
    std::env::var("ECHOMIRROR_CONTRACT_API_BASE")
        .unwrap_or_else(|_| "http://127.0.0.1:18080".into())
}

fn spec_path() -> String {
    std::env::var("ECHOMIRROR_CONTRACT_SPEC").unwrap_or_else(|_| DEFAULT_SPEC.into())
}

fn read_spec() -> Value {
    let mut file = std::fs::File::open(spec_path())
        .unwrap_or_else(|e| panic!("cannot read contract spec: {e}"));
    let mut text = String::new();
    file.read_to_string(&mut text)
        .expect("failed to read contract spec");
    serde_json::from_str(&text).expect("contract spec is not valid JSON")
}

fn op<'a>(spec: &'a Value, id: &str) -> &'a Value {
    spec["operations"]
        .as_array()
        .expect("spec.operations")
        .iter()
        .find(|o| o["id"] == id)
        .unwrap_or_else(|| panic!("operation {id} not found in contract spec"))
}

fn fixture_reachable(host: &str, port: u16) -> bool {
    let addr = format!("{host}:{port}")
        .to_socket_addrs()
        .ok()
        .and_then(|mut it| it.next());
    let Some(addr) = addr else { return false };
    TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
}

/// Assert every `{field, eq, path?}` assertion in the spec against a canonical
/// (snake_case) wire-shaped JSON value.
fn assert_wire(wire: &Value, assertions: &[Value], op_id: &str) {
    for a in assertions {
        let field = a["field"].as_str().unwrap();
        let expected = &a["eq"];
        let path = a["path"].as_str().unwrap_or("");
        let mut node = wire;
        for seg in path.split('.') {
            if seg.is_empty() {
                continue;
            }
            node = match seg.parse::<usize>() {
                Ok(idx) => node
                    .as_array()
                    .and_then(|a| a.get(idx))
                    .unwrap_or_else(|| panic!("{op_id}: missing index {seg:?} in {wire}")),
                Err(_) => node
                    .as_object()
                    .and_then(|o| o.get(seg))
                    .unwrap_or_else(|| panic!("{op_id}: missing path segment {seg:?} in {wire}")),
            };
        }
        let actual = node.get(field).unwrap_or_else(|| {
            panic!("{op_id}: missing field {field:?} (path {path:?}) in {wire}")
        });
        assert_eq!(actual, expected, "{op_id}: field {field:?} (path {path:?})");
    }
}

/// All contract operations the core crate must satisfy, driven by the spec.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn contract_core_bindings() {
    let host = "127.0.0.1";
    let port = 18080u16;
    if !fixture_reachable(host, port) {
        eprintln!(
            "skipping contract tests: fixture not reachable at {host}:{port} (run \
             `docker compose -f contract-tests/docker-compose.yml up -d` first)"
        );
        return;
    }

    let spec = read_spec();
    let config = EchoMirrorConfig::testnet("contract-test-key")
        .with_base_url(api_base())
        .with_max_retries(0);
    let client = EchoMirrorClient::new(config).expect("failed to build EchoMirrorClient");

    // fetch_mood_streak
    {
        let o = op(&spec, "fetch_mood_streak");
        let streak = get_mood_streak(&client).await.expect("fetch_mood_streak");
        assert_wire(
            &serde_json::to_value(streak).unwrap(),
            o["assertions"].as_array().unwrap(),
            "fetch_mood_streak",
        );
    }

    // fetch_mood_summary
    {
        let o = op(&spec, "fetch_mood_summary");
        let summary = get_mood_summary(&client, "week")
            .await
            .expect("fetch_mood_summary");
        assert_wire(
            &serde_json::to_value(summary).unwrap(),
            o["assertions"].as_array().unwrap(),
            "fetch_mood_summary",
        );
    }

    // log_mood
    {
        let o = op(&spec, "log_mood");
        let entry = log_mood(
            &client,
            LogMoodPayload {
                score: 8,
                note: Some("Great day".into()),
                tags: vec!["work".into(), "proud".into()],
            },
        )
        .await
        .expect("log_mood");
        assert_wire(
            &serde_json::to_value(entry).unwrap(),
            o["assertions"].as_array().unwrap(),
            "log_mood",
        );
    }

    // get_social_feed
    {
        let o = op(&spec, "get_social_feed");
        let feed = get_global_feed(&client, 10).await.expect("get_social_feed");
        assert_wire(
            &json!({ "entries": feed }),
            o["assertions"].as_array().unwrap(),
            "get_social_feed",
        );
    }

    // get_leaderboard
    {
        let o = op(&spec, "get_leaderboard");
        let leaderboard = get_leaderboard(&client, 10).await.expect("get_leaderboard");
        assert_wire(
            &json!({ "entries": leaderboard }),
            o["assertions"].as_array().unwrap(),
            "get_leaderboard",
        );
    }
}
