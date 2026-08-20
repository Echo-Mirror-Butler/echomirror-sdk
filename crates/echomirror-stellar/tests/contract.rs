//! EchoMirror contract-test runner (Rust / Stellar bindings).
//!
//! Reads the shared `contract-tests/contract-spec.json` and drives the real
//! `echomirror_stellar` bindings against the docker-compose fixture:
//!   - `fixture-api`     (127.0.0.1:18080)  — build-transfer, submit, history
//!   - `fixture-horizon` (127.0.0.1:18081)  — balance + account-not-found
//!
//! Assertions go through the typed deserialization / error paths so drift in
//! the Rust types is caught, not just raw HTTP. The suite self-skips when the
//! fixture is not reachable.
//!
//! Env overrides:
//!   ECHOMIRROR_CONTRACT_SPEC          path to contract-spec.json
//!   ECHOMIRROR_CONTRACT_API_BASE      e.g. http://127.0.0.1:18080
//!   ECHOMIRROR_CONTRACT_HORIZON_BASE  e.g. http://127.0.0.1:18081

use std::io::Read;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use echomirror_core::{EchoMirrorClient, EchoMirrorConfig, EchoMirrorError};
use echomirror_stellar::{
    build_echo_transfer, get_balance, get_transaction_history, submit_transaction,
    EchoTransferParams, HorizonClient,
};
use serde_json::{json, Value};

const DEFAULT_SPEC: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contract-tests/contract-spec.json"
);

const PK: &str = "GDKUJHNOCQ6NOFJCSPE5IZMFFRZ6U4VO3EEFJQKJSDK5B4VZTH4XKSKD";

fn api_base() -> String {
    std::env::var("ECHOMIRROR_CONTRACT_API_BASE")
        .unwrap_or_else(|_| "http://127.0.0.1:18080".into())
}

fn horizon_base() -> String {
    std::env::var("ECHOMIRROR_CONTRACT_HORIZON_BASE")
        .unwrap_or_else(|_| "http://127.0.0.1:18081".into())
}

fn read_spec() -> Value {
    let path = std::env::var("ECHOMIRROR_CONTRACT_SPEC").unwrap_or_else(|_| DEFAULT_SPEC.into());
    let mut file =
        std::fs::File::open(&path).unwrap_or_else(|e| panic!("cannot read contract spec: {e}"));
    let mut text = String::new();
    file.read_to_string(&mut text)
        .expect("failed to read contract spec");
    serde_json::from_str(&text).expect("contract spec is not valid JSON")
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

/// All Stellar contract operations, driven by the spec.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn contract_stellar_bindings() {
    for (host, port) in [("127.0.0.1", 18080u16), ("127.0.0.1", 18081u16)] {
        if !fixture_reachable(host, port) {
            if std::env::var("ECHOMIRROR_CONTRACT_SPEC").is_ok() {
                panic!(
                    "contract fixture not reachable at {host}:{port} — contract tests are required \
                     because ECHOMIRROR_CONTRACT_SPEC is set"
                );
            }
            eprintln!(
                "skipping contract tests: fixture not reachable at {host}:{port} (run \
                 `docker compose -f contract-tests/docker-compose.yml up -d` first)"
            );
            return;
        }
    }

    let spec = read_spec();
    let config = EchoMirrorConfig::testnet("contract-test-key")
        .with_base_url(api_base())
        .with_horizon_url(horizon_base())
        .with_max_retries(0);
    let client = EchoMirrorClient::new(config).expect("failed to build EchoMirrorClient");

    // build_echo_transfer
    let unsigned = build_echo_transfer(
        &client,
        EchoTransferParams {
            from: PK.into(),
            to: "GDD6NGUJ3W5OWKX4ZP3JVPQF3T7YNONI3B4QJ6WY2XQKJRBZDK7G4T5QZ".into(),
            amount: 5.0,
            memo: Some("Great energy today".into()),
        },
    )
    .await
    .expect("build_echo_transfer");
    assert_wire(
        &serde_json::to_value(&unsigned).unwrap(),
        op(&spec, "build_echo_transfer")["assertions"]
            .as_array()
            .unwrap(),
        "build_echo_transfer",
    );

    // submit_payment_transaction
    let tx = submit_transaction(&client, &unsigned.xdr)
        .await
        .expect("submit_payment_transaction");
    assert_wire(
        &serde_json::to_value(&tx).unwrap(),
        op(&spec, "submit_payment_transaction")["assertions"]
            .as_array()
            .unwrap(),
        "submit_payment_transaction",
    );

    // get_transaction_history
    let page = get_transaction_history(&client, PK, 10, None)
        .await
        .expect("get_transaction_history");
    assert_wire(
        &serde_json::to_value(&page).unwrap(),
        op(&spec, "get_transaction_history")["assertions"]
            .as_array()
            .unwrap(),
        "get_transaction_history",
    );

    // get_stellar_balance (Horizon wire shape, via the SDK's Horizon client)
    let balances = HorizonClient::new(horizon_base())
        .account_balances(PK)
        .await
        .expect("get_stellar_balance");
    assert_wire(
        &json!({ "balances": balances }),
        op(&spec, "get_stellar_balance")["assertions"]
            .as_array()
            .unwrap(),
        "get_stellar_balance",
    );

    // get_balance: the API-shape binding that derives xlm/echo from Horizon
    let balance = get_balance(&client, PK).await.expect("get_balance");
    assert_eq!(balance.xlm, "100.0000000", "get_balance xlm");
    assert_eq!(balance.echo, "1250.0000000", "get_balance echo");
    assert_eq!(balance.network, "testnet", "get_balance network");

    // horizon_account_not_found: SDK must surface a non-retryable NotFound.
    let err = get_balance(
        &client,
        "GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    )
    .await
    .expect_err("horizon_account_not_found: expected error");
    assert!(
        matches!(err, EchoMirrorError::NotFound(_)),
        "horizon_account_not_found: unexpected error: {err:?}"
    );
    assert!(
        !err.is_retryable(),
        "horizon_account_not_found must not be retryable"
    );

    // api_request_to_unknown_route_must_fail: bindings must surface a 404 as an error.
    let unknown_path = "/stellar/transactions?public_key=".to_string() + PK + "&limit=10&unknown=1";
    let err = client
        .get::<Value>(&unknown_path)
        .await
        .expect_err("api_request_to_unknown_route_must_fail: expected error");
    match &err {
        EchoMirrorError::Http { status, .. } => {
            assert_eq!(
                *status, 404,
                "api_request_to_unknown_route_must_fail: {err:?}"
            );
        }
        other => panic!("api_request_to_unknown_route_must_fail: unexpected error: {other:?}"),
    }
    assert!(!err.is_retryable(), "unknown route must not be retried");
}

fn op<'a>(spec: &'a Value, id: &str) -> &'a Value {
    spec["operations"]
        .as_array()
        .expect("spec.operations")
        .iter()
        .find(|o| o["id"] == id)
        .unwrap_or_else(|| panic!("operation {id} not found in contract spec"))
}
