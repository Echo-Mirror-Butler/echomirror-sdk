//! `HorizonClient::get_transactions` — page parsing, pagination cursors, and
//! error mapping.
//!
//! Fully offline (issue #204): `wiremock` stands in for Horizon. `/payments`
//! has its own suite in `horizon_payments_tests.rs`; this file covers the
//! account-transaction history endpoint and the shared pagination behavior.

use std::collections::HashMap;

use echomirror_core::EchoMirrorError;
use echomirror_stellar::HorizonClient;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn transaction_record(id: u64, memo: Option<&str>) -> serde_json::Value {
    serde_json::json!({
        "id": id.to_string(),
        "paging_token": id.to_string(),
        "hash": format!("hash-{id}"),
        // Real ledger sequences, not paging tokens — the `ledger` field is a
        // u32 on the wire and in `HorizonTransactionRecord`.
        "ledger": 50_000_000 + id,
        "created_at": "2026-07-20T21:10:30Z",
        "fee_charged": "100",
        "memo": memo,
    })
}

/// Query parameters of the single request the mock server received.
async fn query_of(server: &MockServer) -> HashMap<String, String> {
    let requests = server.received_requests().await.expect("request recording");
    let last = requests.last().expect("at least one request");
    last.url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect()
}

#[tokio::test]
async fn get_transactions_parses_a_page_of_records() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/accounts/GACCOUNT/transactions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "_embedded": {
                "records": [
                    transaction_record(1, Some("coffee")),
                    transaction_record(2, None),
                ]
            }
        })))
        .mount(&server)
        .await;

    let page = HorizonClient::new(server.uri())
        .get_transactions("GACCOUNT", None, 100)
        .await
        .expect("get_transactions");

    assert_eq!(page.embedded.records.len(), 2);
    let first = &page.embedded.records[0];
    assert_eq!(first.id, "1");
    assert_eq!(first.paging_token, "1");
    assert_eq!(first.hash, "hash-1");
    assert_eq!(first.ledger, 50_000_001);
    assert_eq!(first.created_at, "2026-07-20T21:10:30Z");
    assert_eq!(first.fee_charged, "100");
    assert_eq!(first.memo.as_deref(), Some("coffee"));
    // `memo` is optional on the wire; a record without one deserializes to None
    // rather than failing the whole page.
    assert!(page.embedded.records[1].memo.is_none());
}

#[tokio::test]
async fn get_transactions_returns_an_empty_page_for_a_fresh_account() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "_embedded": { "records": [] } })),
        )
        .mount(&server)
        .await;

    let page = HorizonClient::new(server.uri())
        .get_transactions("GNEW", None, 10)
        .await
        .expect("an empty page is not an error");

    assert!(page.embedded.records.is_empty());
}

#[tokio::test]
async fn get_transactions_sends_limit_and_ascending_order() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/accounts/GACCOUNT/transactions"))
        .and(query_param("limit", "200"))
        .and(query_param("order", "asc"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "_embedded": { "records": [] } })),
        )
        .mount(&server)
        .await;

    HorizonClient::new(server.uri())
        .get_transactions("GACCOUNT", None, 200)
        .await
        .expect("get_transactions");

    let params = query_of(&server).await;
    assert_eq!(params.get("limit").map(String::as_str), Some("200"));
    assert_eq!(params.get("order").map(String::as_str), Some("asc"));
    assert!(
        !params.contains_key("cursor"),
        "the first page must not send a cursor: {params:?}"
    );
}

#[tokio::test]
async fn get_transactions_forwards_the_resume_cursor() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/accounts/GACCOUNT/transactions"))
        .and(query_param("cursor", "12884905985"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "_embedded": { "records": [] } })),
        )
        .mount(&server)
        .await;

    // A cursor the mock only answers for the exact value above: if the cursor
    // were dropped or mangled, the mock would not match and the call would fail.
    HorizonClient::new(server.uri())
        .get_transactions("GACCOUNT", Some("12884905985"), 50)
        .await
        .expect("get_transactions with a cursor");

    let params = query_of(&server).await;
    assert_eq!(
        params.get("cursor").map(String::as_str),
        Some("12884905985")
    );
}

#[tokio::test]
async fn get_transactions_maps_429_to_a_non_retryable_http_error() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(429).set_body_string("slow down"))
        .mount(&server)
        .await;

    let err = HorizonClient::new(server.uri())
        .get_transactions("GACCOUNT", None, 100)
        .await
        .expect_err("expected an error");

    match &err {
        EchoMirrorError::Http { status, message } => {
            assert_eq!(*status, 429);
            assert_eq!(message, "slow down");
        }
        other => panic!("expected Http, got {other:?}"),
    }
    assert!(!err.is_retryable());
}

#[tokio::test]
async fn get_transactions_maps_5xx_to_a_retryable_http_error() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(500).set_body_string("boom"))
        .mount(&server)
        .await;

    let err = HorizonClient::new(server.uri())
        .get_transactions("GACCOUNT", None, 100)
        .await
        .expect_err("expected an error");

    match &err {
        EchoMirrorError::Http { status, message } => {
            assert_eq!(*status, 500);
            assert_eq!(message, "boom");
        }
        other => panic!("expected Http, got {other:?}"),
    }
    assert!(err.is_retryable());
}

#[tokio::test]
async fn get_transactions_rejects_a_page_missing_its_records() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "_embedded": { "records": {} } })),
        )
        .mount(&server)
        .await;

    let err = HorizonClient::new(server.uri())
        .get_transactions("GACCOUNT", None, 100)
        .await
        .expect_err("a schema-drifted page must not be reported as empty");

    // See the note in `horizon_account_tests.rs`: `res.json()` decode failures
    // arrive as reqwest errors and are mapped to `Network`.
    assert!(
        matches!(err, EchoMirrorError::Network(_)),
        "expected Network, got {err:?}"
    );
}
