use echomirror_core::{CacheConfig, EchoMirrorClient, EchoMirrorConfig};
use serde::{Deserialize, Serialize};
use wiremock::{matchers, Mock, MockServer, ResponseTemplate};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct TestResponse {
    message: String,
}

fn cache_enabled_client(base_url: String) -> EchoMirrorClient {
    EchoMirrorClient::new(
        EchoMirrorConfig::new("test-api-key")
            .with_base_url(base_url)
            .with_max_retries(0)
            .with_cache(CacheConfig {
                enabled: true,
                max_entries: 2,
                ..Default::default()
            }),
    )
    .expect("client")
}

#[tokio::test]
async fn etag_revalidation_returns_the_cached_body() {
    let mock_server = MockServer::start().await;

    // Register the conditional response first. The initial request has no
    // validator and reaches the one-use 200 mock below; the next identical
    // request must carry If-None-Match to receive this 304.
    Mock::given(matchers::method("GET"))
        .and(matchers::header("if-none-match", "\"version-1\""))
        .respond_with(ResponseTemplate::new(304))
        .mount(&mock_server)
        .await;
    Mock::given(matchers::method("GET"))
        .respond_with(
            ResponseTemplate::new(200)
                .append_header("etag", "\"version-1\"")
                .set_body_json(&TestResponse {
                    message: "cached body".to_string(),
                }),
        )
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    let client = cache_enabled_client(mock_server.uri());
    assert_eq!(
        client.get::<TestResponse>("/resource").await.unwrap(),
        TestResponse {
            message: "cached body".to_string(),
        }
    );
    assert_eq!(
        client.get::<TestResponse>("/resource").await.unwrap(),
        TestResponse {
            message: "cached body".to_string(),
        }
    );

    let metrics = client.metrics();
    assert_eq!(metrics.cache_misses, 1);
    assert_eq!(metrics.cache_hits, 1);
}

#[tokio::test]
async fn last_modified_revalidation_uses_if_modified_since() {
    let mock_server = MockServer::start().await;
    const LAST_MODIFIED: &str = "Wed, 21 Oct 2015 07:28:00 GMT";

    Mock::given(matchers::method("GET"))
        .and(matchers::header_exists("if-modified-since"))
        .respond_with(ResponseTemplate::new(304))
        .mount(&mock_server)
        .await;
    Mock::given(matchers::method("GET"))
        .respond_with(
            ResponseTemplate::new(200)
                .append_header("last-modified", LAST_MODIFIED)
                .set_body_json(&TestResponse {
                    message: "cached body".to_string(),
                }),
        )
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    let client = cache_enabled_client(mock_server.uri());
    client.get::<TestResponse>("/resource").await.unwrap();
    let second = client.get::<TestResponse>("/resource").await;
    let requests = mock_server.received_requests().await.unwrap();
    assert_eq!(
        requests[1]
            .headers
            .get("if-modified-since")
            .and_then(|value| value.to_str().ok()),
        Some(LAST_MODIFIED)
    );
    assert_eq!(
        second.unwrap(),
        TestResponse {
            message: "cached body".to_string(),
        }
    );
}
