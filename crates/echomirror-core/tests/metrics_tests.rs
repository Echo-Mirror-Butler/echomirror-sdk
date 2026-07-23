use echomirror_core::{EchoMirrorClient, EchoMirrorConfig, MetricsSnapshot};
use serde::{Deserialize, Serialize};
use wiremock::{matchers, Mock, MockServer, ResponseTemplate};

#[derive(Debug, Serialize, Deserialize)]
struct TestResponse {
    message: String,
}

#[tokio::test]
async fn test_metrics_record_successful_request() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "success".to_string(),
        }))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key").with_base_url(mock_server.uri());

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.total_requests, 1);
    assert_eq!(metrics.successful_requests, 1);
    assert_eq!(metrics.failed_requests, 0);
    assert_eq!(metrics.total_retries, 0);
}

#[tokio::test]
async fn test_metrics_record_failed_request() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(400).set_body_string("Bad request"))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key").with_base_url(mock_server.uri());

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.total_requests, 1);
    assert_eq!(metrics.successful_requests, 0);
    assert_eq!(metrics.failed_requests, 1);
    assert_eq!(metrics.total_retries, 0);
}

#[tokio::test]
async fn test_metrics_record_retries() {
    let mock_server = MockServer::start().await;

    // First two requests fail with 503, third succeeds
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(2)
        .mount(&mock_server)
        .await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "success".to_string(),
        }))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(3);

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.total_requests, 1);
    assert_eq!(metrics.successful_requests, 1);
    assert_eq!(metrics.failed_requests, 0);
    assert_eq!(metrics.total_retries, 2); // 2 retries before success
    assert!(metrics.total_backoff_ms > 0);
}

#[tokio::test]
async fn test_metrics_record_server_errors() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(0); // No retries to get exactly 1 error

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.server_errors, 1);
    assert_eq!(metrics.client_errors, 0);
}

#[tokio::test]
async fn test_metrics_record_client_errors() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(400).set_body_string("Bad request"))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key").with_base_url(mock_server.uri());

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.server_errors, 0);
    assert_eq!(metrics.client_errors, 1);
}

#[tokio::test]
async fn test_metrics_record_rate_limit_errors() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(429).append_header("retry-after", "1"))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(0); // No retries to get exactly 1 error

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.rate_limit_errors, 1);
    // With no retries, no backoff should occur
    assert_eq!(metrics.total_backoff_ms, 0);
}

#[tokio::test]
async fn test_metrics_record_token_refresh() {
    let mock_server = MockServer::start().await;

    // First request returns 401 (auth expired)
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(401))
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    // Second request succeeds after token refresh
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "success".to_string(),
        }))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(3)
        .with_token_refresh_callback(|| Ok("new-token".to_string()));

    let client = EchoMirrorClient::new(config).unwrap();
    client.set_auth_token(Some("old-token".to_string())).await;

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.token_refresh_attempts, 1);
    assert_eq!(metrics.token_refresh_successes, 1);
    assert_eq!(metrics.token_refresh_failures, 0);
    assert_eq!(metrics.auth_expired_errors, 1);
}

#[tokio::test]
async fn test_metrics_record_token_refresh_failure() {
    let mock_server = MockServer::start().await;

    // All requests return 401 (auth expired)
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(3)
        .with_token_refresh_callback(|| Err("refresh failed".into()));

    let client = EchoMirrorClient::new(config).unwrap();
    client.set_auth_token(Some("old-token".to_string())).await;

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.token_refresh_attempts, 1);
    assert_eq!(metrics.token_refresh_successes, 0);
    assert_eq!(metrics.token_refresh_failures, 1);
    assert_eq!(metrics.auth_expired_errors, 1);
}

#[tokio::test]
async fn test_metrics_reset() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "success".to_string(),
        }))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key").with_base_url(mock_server.uri());

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;

    let metrics_before = client.metrics();
    assert!(metrics_before.total_requests > 0);

    client.reset_metrics();

    let metrics_after = client.metrics();
    assert_eq!(metrics_after.total_requests, 0);
    assert_eq!(metrics_after.successful_requests, 0);
    assert_eq!(metrics_after.failed_requests, 0);
}

#[tokio::test]
async fn test_metrics_snapshot_calculations() {
    let snapshot = MetricsSnapshot {
        total_requests: 100,
        successful_requests: 95,
        failed_requests: 5,
        total_retries: 10,
        token_refresh_attempts: 2,
        token_refresh_successes: 2,
        token_refresh_failures: 0,
        total_backoff_ms: 500,
        rate_limit_errors: 3,
        network_errors: 2,
        server_errors: 3,
        client_errors: 2,
        auth_expired_errors: 2,
    };

    assert_eq!(snapshot.success_rate(), 95.0);
    assert_eq!(snapshot.retry_rate(), 10.0);
    assert_eq!(snapshot.average_backoff_ms(), 50.0);
    assert_eq!(snapshot.token_refresh_success_rate(), 100.0);
}

#[tokio::test]
async fn test_metrics_multiple_requests() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "success".to_string(),
        }))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key").with_base_url(mock_server.uri());

    let client = EchoMirrorClient::new(config).unwrap();

    // Make multiple requests
    for _ in 0..5 {
        let _ = client.get::<TestResponse>("/test").await;
    }

    let metrics = client.metrics();
    assert_eq!(metrics.total_requests, 5);
    assert_eq!(metrics.successful_requests, 5);
    assert_eq!(metrics.failed_requests, 0);
}

#[tokio::test]
async fn test_metrics_mixed_success_and_failure() {
    let mock_server = MockServer::start().await;

    // First request succeeds
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "success".to_string(),
        }))
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    // Second request fails
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(400).set_body_string("Bad request"))
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key").with_base_url(mock_server.uri());

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;
    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.total_requests, 2);
    assert_eq!(metrics.successful_requests, 1);
    assert_eq!(metrics.failed_requests, 1);
}

#[tokio::test]
async fn test_metrics_backoff_accumulation() {
    let mock_server = MockServer::start().await;

    // First two requests fail with 503, third succeeds
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(2)
        .mount(&mock_server)
        .await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "success".to_string(),
        }))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(3);

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert!(metrics.total_backoff_ms > 0);
    // With 2 retries, we should have accumulated backoff time
    // First retry: ~100ms, second retry: ~200ms
    assert!(metrics.total_backoff_ms >= 100);
}

#[tokio::test]
async fn test_metrics_no_retries_on_client_error() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(400).set_body_string("Bad request"))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(3);

    let client = EchoMirrorClient::new(config).unwrap();

    let _ = client.get::<TestResponse>("/test").await;

    let metrics = client.metrics();
    assert_eq!(metrics.total_retries, 0); // Should not retry on 400
    assert_eq!(metrics.client_errors, 1);
}
