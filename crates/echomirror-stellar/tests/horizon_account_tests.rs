//! `HorizonClient` construction and `account_balances` — the account-lookup
//! path every balance read in this crate starts from.
//!
//! Fully offline (issue #204): `wiremock` stands in for Horizon, so nothing
//! here ever resolves `horizon.stellar.org`. The three constructors are
//! asserted against their configured base URL rather than by issuing a request,
//! which is what [`HorizonClient::base_url`] is for.

use echomirror_core::EchoMirrorError;
use echomirror_stellar::HorizonClient;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

// ── Constructors ─────────────────────────────────────────────────────────────

#[test]
fn new_preserves_the_base_url_it_was_given() {
    // Also covers the self-hosted-Horizon case: `new` is the only way to point
    // the client at a node that is not a public network.
    let client = HorizonClient::new("http://127.0.0.1:8080");
    assert_eq!(client.base_url(), "http://127.0.0.1:8080");
}

#[test]
fn new_accepts_an_owned_string() {
    let client = HorizonClient::new(String::from("http://localhost:1234"));
    assert_eq!(client.base_url(), "http://localhost:1234");
}

#[test]
fn mainnet_points_at_the_public_horizon() {
    assert_eq!(
        HorizonClient::mainnet().base_url(),
        "https://horizon.stellar.org"
    );
}

#[test]
fn testnet_points_at_the_public_testnet_horizon() {
    assert_eq!(
        HorizonClient::testnet().base_url(),
        "https://horizon-testnet.stellar.org"
    );
}

#[test]
fn mainnet_and_testnet_are_different_networks() {
    // Guards against a copy/paste regression collapsing both constructors onto
    // the same host, which would silently send mainnet traffic to testnet.
    assert_ne!(
        HorizonClient::mainnet().base_url(),
        HorizonClient::testnet().base_url()
    );
}

// ── account_balances ──────────────────────────────────────────────────────────

#[tokio::test]
async fn account_balances_parses_native_and_credit_balances() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/accounts/GACCOUNT"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "balances": [
                { "balance": "100.5000000", "asset_type": "native" },
                {
                    "balance": "2500.0000000",
                    "asset_type": "credit_alphanum4",
                    "asset_code": "ECHO",
                    "asset_issuer": "GISSUER"
                },
                {
                    "balance": "7.0000000",
                    "asset_type": "credit_alphanum12",
                    "asset_code": "LONGCODENAME",
                    "asset_issuer": "GISSUER2"
                }
            ]
        })))
        .mount(&server)
        .await;

    let balances = HorizonClient::new(server.uri())
        .account_balances("GACCOUNT")
        .await
        .expect("account_balances");

    assert_eq!(balances.len(), 3);
    assert_eq!(balances[0].balance, "100.5000000");
    assert_eq!(balances[0].asset_type, "native");
    // Real Horizon omits asset_code/asset_issuer for native balances, so the
    // deserializer has to tolerate their absence.
    assert!(balances[0].asset_code.is_none());
    assert!(balances[0].asset_issuer.is_none());
    assert_eq!(balances[1].asset_code.as_deref(), Some("ECHO"));
    assert_eq!(balances[1].asset_issuer.as_deref(), Some("GISSUER"));
    assert_eq!(balances[2].asset_code.as_deref(), Some("LONGCODENAME"));
}

#[tokio::test]
async fn account_balances_handles_an_account_with_no_balances() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "balances": [] })))
        .mount(&server)
        .await;

    let balances = HorizonClient::new(server.uri())
        .account_balances("GEMPTY")
        .await
        .expect("an account with no balances is not an error");

    assert!(balances.is_empty());
}

#[tokio::test]
async fn account_balances_requests_the_account_endpoint_as_json() {
    let server = MockServer::start().await;
    // The path and Accept header are part of the contract with Horizon; a mock
    // that does not match both returns 404 and fails the call below.
    Mock::given(method("GET"))
        .and(path("/accounts/GACCOUNT"))
        .and(header("accept", "application/json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "balances": [] })))
        .mount(&server)
        .await;

    HorizonClient::new(server.uri())
        .account_balances("GACCOUNT")
        .await
        .expect("account_balances");

    let requests = server.received_requests().await.expect("request recording");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].url.path(), "/accounts/GACCOUNT");
}

#[tokio::test]
async fn account_balances_maps_404_to_a_non_retryable_not_found() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(404).set_body_string("not found"))
        .mount(&server)
        .await;

    let err = HorizonClient::new(server.uri())
        .account_balances("GUNFUNDED")
        .await
        .expect_err("an unfunded account is not an error the caller can retry");

    match &err {
        EchoMirrorError::NotFound(message) => {
            assert!(
                message.contains("GUNFUNDED"),
                "the message should name the account it looked up: {message}"
            );
        }
        other => panic!("expected NotFound, got {other:?}"),
    }
    assert!(!err.is_retryable(), "an unfunded account will not fund itself");
}

#[tokio::test]
async fn account_balances_maps_429_to_a_non_retryable_http_error() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(429).set_body_string("rate limited"))
        .mount(&server)
        .await;

    let err = HorizonClient::new(server.uri())
        .account_balances("GACCOUNT")
        .await
        .expect_err("expected an error");

    match &err {
        EchoMirrorError::Http { status, message } => {
            assert_eq!(*status, 429);
            assert_eq!(message, "rate limited");
        }
        other => panic!("expected Http, got {other:?}"),
    }
    // HorizonClient does no rate-limit handling of its own — it surfaces the
    // status verbatim, and the 4xx branch of `is_retryable` applies.
    assert!(!err.is_retryable());
}

#[tokio::test]
async fn account_balances_maps_5xx_to_a_retryable_http_error() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(503).set_body_string("horizon is down"))
        .mount(&server)
        .await;

    let err = HorizonClient::new(server.uri())
        .account_balances("GACCOUNT")
        .await
        .expect_err("expected an error");

    match &err {
        EchoMirrorError::Http { status, message } => {
            assert_eq!(*status, 503);
            assert_eq!(message, "horizon is down");
        }
        other => panic!("expected Http, got {other:?}"),
    }
    assert!(err.is_retryable(), "5xx is transient");
}

#[tokio::test]
async fn account_balances_rejects_a_malformed_body() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_string("{\"balances\": \"not-an-array\"}"))
        .mount(&server)
        .await;

    let err = HorizonClient::new(server.uri())
        .account_balances("GACCOUNT")
        .await
        .expect_err("a garbled Horizon response must not be reported as success");

    // `res.json()` surfaces a decoding failure as a reqwest error, which this
    // crate maps to `Network`. Recorded here as the current contract: a
    // truncated or schema-drifted response is indistinguishable from a
    // transport failure, so it is treated as retryable.
    assert!(
        matches!(err, EchoMirrorError::Network(_)),
        "expected Network, got {err:?}"
    );
    assert!(err.is_retryable());
}

#[tokio::test]
async fn account_balances_rejects_a_response_that_is_not_json_at_all() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_string("<html>gateway</html>"))
        .mount(&server)
        .await;

    let err = HorizonClient::new(server.uri())
        .account_balances("GACCOUNT")
        .await
        .expect_err("an HTML error page is not an account");

    assert!(
        matches!(err, EchoMirrorError::Network(_)),
        "expected Network, got {err:?}"
    );
}
