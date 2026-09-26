//! `get_balance` — derives the XLM/ECHO pair from a Horizon account and maps
//! Horizon's failure modes into `echomirror_core::EchoMirrorError`.
//!
//! Fully offline (issue #204): `get_balance` builds its own `HorizonClient`
//! from `EchoMirrorConfig::resolved_horizon_url()`, so pointing
//! `with_horizon_url` at a `wiremock` server is enough to keep the whole path
//! — including the account lookup — off the network.

use echomirror_core::{EchoMirrorClient, EchoMirrorConfig, EchoMirrorError};
use echomirror_stellar::get_balance;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const PK: &str = "GACCOUNT";

fn client_for(horizon_uri: &str) -> EchoMirrorClient {
    EchoMirrorClient::new(
        EchoMirrorConfig::testnet("test-key")
            .with_horizon_url(horizon_uri)
            .with_max_retries(0),
    )
    .expect("client")
}

async fn serve(server: &MockServer, status: u16, body: serde_json::Value) {
    Mock::given(method("GET"))
        .and(path(format!("/accounts/{PK}")))
        .respond_with(ResponseTemplate::new(status).set_body_json(body))
        .mount(server)
        .await;
}

#[tokio::test]
async fn get_balance_reports_native_and_echo_balances() {
    let server = MockServer::start().await;
    serve(
        &server,
        200,
        serde_json::json!({
            "balances": [
                { "balance": "100.5000000", "asset_type": "native" },
                {
                    "balance": "2500.7500000",
                    "asset_type": "credit_alphanum4",
                    "asset_code": "ECHO",
                    "asset_issuer": "GISSUER"
                }
            ]
        }),
    )
    .await;

    let balance = get_balance(&client_for(&server.uri()), PK)
        .await
        .expect("get_balance");

    assert_eq!(balance.xlm, "100.5000000");
    assert_eq!(balance.echo, "2500.7500000");
    assert_eq!(balance.public_key, PK);
    assert_eq!(balance.network, "testnet");
}

#[tokio::test]
async fn get_balance_defaults_both_amounts_to_zero_for_an_empty_account() {
    let server = MockServer::start().await;
    serve(&server, 200, serde_json::json!({ "balances": [] })).await;

    let balance = get_balance(&client_for(&server.uri()), PK)
        .await
        .expect("an account with no balances is not an error");

    assert_eq!(balance.xlm, "0");
    assert_eq!(balance.echo, "0");
}

#[tokio::test]
async fn get_balance_ignores_credit_balances_that_are_not_echo() {
    let server = MockServer::start().await;
    serve(
        &server,
        200,
        serde_json::json!({
            "balances": [
                { "balance": "12.0000000", "asset_type": "native" },
                {
                    "balance": "900.0000000",
                    "asset_type": "credit_alphanum4",
                    "asset_code": "USDC",
                    "asset_issuer": "GISSUER"
                },
                {
                    "balance": "3.0000000",
                    "asset_type": "credit_alphanum12",
                    "asset_code": "LONGCODENAME",
                    "asset_issuer": "GISSUER"
                }
            ]
        }),
    )
    .await;

    let balance = get_balance(&client_for(&server.uri()), PK)
        .await
        .expect("get_balance");

    assert_eq!(balance.xlm, "12.0000000");
    // ECHO is the only asset this binding reports; everything else is
    // deliberately dropped rather than folded into `echo`.
    assert_eq!(balance.echo, "0");
}

#[tokio::test]
async fn get_balance_only_treats_credit_balances_as_echo() {
    let server = MockServer::start().await;
    serve(
        &server,
        200,
        serde_json::json!({
            "balances": [
                // Both of these carry asset_code "ECHO", but only the
                // credit_alphanum* shapes are trustline balances — the match
                // guards on asset_type first, so the malformed one is ignored.
                { "balance": "500.0000000", "asset_type": "credit_alphanum4", "asset_code": "ECHO" },
                { "balance": "700.0000000", "asset_type": "native", "asset_code": "ECHO" }
            ]
        }),
    )
    .await;

    let balance = get_balance(&client_for(&server.uri()), PK)
        .await
        .expect("get_balance");

    assert_eq!(balance.echo, "500.0000000");
    // The malformed native entry did not become the XLM balance either.
    assert_eq!(balance.xlm, "700.0000000");
}

#[tokio::test]
async fn get_balance_reports_the_configured_network() {
    let server = MockServer::start().await;
    serve(&server, 200, serde_json::json!({ "balances": [] })).await;

    let testnet = get_balance(&client_for(&server.uri()), PK)
        .await
        .expect("testnet get_balance");
    assert_eq!(testnet.network, "testnet");

    // The same Horizon fixture, reached through a mainnet-configured client:
    // the network label comes from the config, not from the URL.
    let mainnet_client = EchoMirrorClient::new(
        EchoMirrorConfig::new("test-key")
            .with_horizon_url(server.uri())
            .with_max_retries(0),
    )
    .expect("client");
    let mainnet = get_balance(&mainnet_client, PK)
        .await
        .expect("mainnet get_balance");
    assert_eq!(mainnet.network, "mainnet");
}

#[tokio::test]
async fn get_balance_stamps_a_fetch_timestamp() {
    let server = MockServer::start().await;
    serve(&server, 200, serde_json::json!({ "balances": [] })).await;

    let balance = get_balance(&client_for(&server.uri()), PK)
        .await
        .expect("get_balance");

    let age_ms = chrono::Utc::now()
        .signed_duration_since(balance.last_fetched)
        .num_milliseconds();
    assert!(
        age_ms.abs() < 60_000,
        "last_fetched should be 'now', was {age_ms}ms ago"
    );
}

#[tokio::test]
async fn get_balance_maps_an_unfunded_account_to_a_non_retryable_not_found() {
    let server = MockServer::start().await;
    serve(&server, 404, serde_json::json!({ "status": 404, "title": "Not Found" }))
        .await;

    let err = get_balance(&client_for(&server.uri()), "GUNFUNDED")
        .await
        .expect_err("an unfunded account has no balance to report");

    match &err {
        EchoMirrorError::NotFound(_) => {}
        other => panic!("expected NotFound, got {other:?}"),
    }
    assert!(!err.is_retryable());
}

#[tokio::test]
async fn get_balance_propagates_horizon_outages_as_retryable() {
    let server = MockServer::start().await;
    serve(&server, 503, serde_json::json!({ "status": 503 })).await;

    let err = get_balance(&client_for(&server.uri()), PK)
        .await
        .expect_err("expected an error");

    match &err {
        EchoMirrorError::Http { status, .. } => assert_eq!(*status, 503),
        other => panic!("expected Http, got {other:?}"),
    }
    assert!(err.is_retryable(), "5xx is transient");
}

#[tokio::test]
async fn get_balance_maps_429_to_a_non_retryable_http_error() {
    let server = MockServer::start().await;
    serve(&server, 429, serde_json::json!({ "status": 429 })).await;

    let err = get_balance(&client_for(&server.uri()), PK)
        .await
        .expect_err("expected an error");

    match &err {
        EchoMirrorError::Http { status, .. } => assert_eq!(*status, 429),
        other => panic!("expected Http, got {other:?}"),
    }
    assert!(!err.is_retryable());
}

#[tokio::test]
async fn get_balance_rejects_a_malformed_account_payload() {
    let server = MockServer::start().await;
    serve(&server, 200, serde_json::json!({ "balances": { "xlm": "1" } })).await;

    let err = get_balance(&client_for(&server.uri()), PK)
        .await
        .expect_err("a schema-drifted payload must not be reported as a zero balance");

    // HorizonClient's `res.json()` decode failure surfaces as a reqwest error
    // mapped to `Network` — see horizon_account_tests.rs.
    assert!(
        matches!(err, EchoMirrorError::Network(_)),
        "expected Network, got {err:?}"
    );
}
