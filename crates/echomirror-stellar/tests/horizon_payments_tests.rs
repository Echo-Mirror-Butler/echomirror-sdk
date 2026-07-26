use echomirror_stellar::HorizonClient;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn payment_page_json() -> serde_json::Value {
    serde_json::json!({
        "_embedded": {
            "records": [
                {
                    "id": "12884905985",
                    "paging_token": "12884905985",
                    "transaction_successful": true,
                    "source_account": "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
                    "type": "create_account",
                    "type_i": 0,
                    "created_at": "2026-07-20T21:09:30Z",
                    "transaction_hash": "3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889",
                    "starting_balance": "10000.0000000",
                    "funder": "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
                    "account": "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6",
                    "transaction": {
                        "ledger": 3,
                        "memo": "hello"
                    }
                },
                {
                    "id": "12884905986",
                    "paging_token": "12884905986",
                    "transaction_successful": true,
                    "source_account": "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
                    "type": "payment",
                    "type_i": 1,
                    "created_at": "2026-07-20T21:10:30Z",
                    "transaction_hash": "4489e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8890",
                    "asset_type": "credit_alphanum4",
                    "asset_code": "ECHO",
                    "asset_issuer": "GISSUER",
                    "from": "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
                    "to": "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6",
                    "amount": "42.5000000"
                }
            ]
        }
    })
}

#[tokio::test]
async fn get_payments_parses_mixed_operation_types() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/accounts/GACCOUNT/payments"))
        .and(query_param("order", "asc"))
        .and(query_param("limit", "100"))
        .respond_with(ResponseTemplate::new(200).set_body_json(payment_page_json()))
        .mount(&server)
        .await;

    let client = HorizonClient::new(server.uri());
    let page = client
        .get_payments("GACCOUNT", None, 100, false)
        .await
        .unwrap();

    assert_eq!(page.embedded.records.len(), 2);

    let create = &page.embedded.records[0];
    assert_eq!(create.op_type, "create_account");
    assert_eq!(create.starting_balance.as_deref(), Some("10000.0000000"));
    assert_eq!(create.transaction.as_ref().unwrap().ledger, 3);
    assert_eq!(
        create.transaction.as_ref().unwrap().memo.as_deref(),
        Some("hello")
    );

    let payment = &page.embedded.records[1];
    assert_eq!(payment.op_type, "payment");
    assert_eq!(payment.asset_code.as_deref(), Some("ECHO"));
    assert_eq!(payment.amount.as_deref(), Some("42.5000000"));
    assert!(payment.transaction.is_none());
}

#[tokio::test]
async fn get_payments_passes_cursor_and_join_params() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/accounts/GACCOUNT/payments"))
        .and(query_param("cursor", "12884905985"))
        .and(query_param("join", "transactions"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "_embedded": { "records": [] } })),
        )
        .mount(&server)
        .await;

    let client = HorizonClient::new(server.uri());
    let page = client
        .get_payments("GACCOUNT", Some("12884905985"), 50, true)
        .await
        .unwrap();
    assert!(page.embedded.records.is_empty());
}

#[tokio::test]
async fn get_payments_surfaces_http_errors() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(429).set_body_string("rate limited"))
        .mount(&server)
        .await;

    let client = HorizonClient::new(server.uri());
    let err = client
        .get_payments("GACCOUNT", None, 100, false)
        .await
        .unwrap_err();
    match err {
        echomirror_core::EchoMirrorError::Http { status, .. } => assert_eq!(status, 429),
        other => panic!("expected Http error, got {other:?}"),
    }
}
