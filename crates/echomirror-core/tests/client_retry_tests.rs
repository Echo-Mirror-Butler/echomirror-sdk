use echomirror_core::{EchoMirrorClient, EchoMirrorConfig, EchoMirrorError};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use wiremock::{matchers, Mock, MockServer, ResponseTemplate};

#[derive(Debug, Serialize, Deserialize)]
struct TestResponse {
    message: String,
}

#[tokio::test]
async fn test_retry_on_503_then_succeed() {
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

    let result = client.get::<TestResponse>("/test").await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap().message, "success");
}

#[tokio::test]
async fn test_no_retry_on_400() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(400).set_body_string("Bad request"))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(3);

    let client = EchoMirrorClient::new(config).unwrap();

    let result: Result<TestResponse, EchoMirrorError> = client.get("/test").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        EchoMirrorError::Http { status, .. } => {
            assert_eq!(status, 400);
        }
        _ => panic!("Expected Http error with status 400"),
    }
}

#[tokio::test]
async fn test_no_retry_on_404() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(404).set_body_string("Not found"))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(3);

    let client = EchoMirrorClient::new(config).unwrap();

    let result: Result<TestResponse, EchoMirrorError> = client.get("/test").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        EchoMirrorError::Http { status, .. } => {
            assert_eq!(status, 404);
        }
        _ => panic!("Expected Http error with status 404"),
    }
}

#[tokio::test]
async fn test_backoff_timing() {
    let mock_server = MockServer::start().await;

    // All requests fail with 503
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(2);

    let client = EchoMirrorClient::new(config).unwrap();

    let start = std::time::Instant::now();
    let result: Result<TestResponse, EchoMirrorError> = client.get("/test").await;
    let elapsed = start.elapsed();

    assert!(result.is_err());
    // With 2 retries, we should have at least some backoff delay
    // First attempt: immediate, second: ~100ms, third: ~200ms
    assert!(elapsed >= Duration::from_millis(100));
}

#[tokio::test]
async fn test_rate_limit_retry_after_honored() {
    let mock_server = MockServer::start().await;

    // First request is rate limited with retry-after of 1 second
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(429).append_header("retry-after", "1"))
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    // Second request succeeds
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

    let start = std::time::Instant::now();
    let result = client.get::<TestResponse>("/test").await;
    let elapsed = start.elapsed();

    assert!(result.is_ok());
    assert_eq!(result.unwrap().message, "success");
    // Should have waited at least 1 second due to retry-after
    assert!(elapsed >= Duration::from_secs(1));
}

#[tokio::test]
async fn test_token_refresh_triggers_once() {
    let mock_server = MockServer::start().await;

    let refresh_count = Arc::new(Mutex::new(0));
    let refresh_count_clone = refresh_count.clone();

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
        .with_token_refresh_callback(move || {
            let mut count = refresh_count_clone.lock().unwrap();
            *count += 1;
            Ok("new-token".to_string())
        });

    let client = EchoMirrorClient::new(config).unwrap();
    client.set_auth_token(Some("old-token".to_string())).await;

    let result = client.get::<TestResponse>("/test").await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap().message, "success");
    assert_eq!(*refresh_count.lock().unwrap(), 1);
}

#[tokio::test]
async fn test_token_refresh_no_infinite_loop() {
    let mock_server = MockServer::start().await;

    let refresh_count = Arc::new(Mutex::new(0));
    let refresh_count_clone = refresh_count.clone();

    // All requests return 401 (auth expired)
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(3)
        .with_token_refresh_callback(move || {
            let mut count = refresh_count_clone.lock().unwrap();
            *count += 1;
            Ok("new-token".to_string())
        });

    let client = EchoMirrorClient::new(config).unwrap();
    client.set_auth_token(Some("old-token".to_string())).await;

    let result: Result<TestResponse, EchoMirrorError> = client.get("/test").await;

    assert!(result.is_err());
    // Token refresh should only be attempted once, not infinitely
    assert_eq!(*refresh_count.lock().unwrap(), 1);
}

#[tokio::test]
async fn test_error_taxonomy_auth_expired() {
    let err = EchoMirrorError::AuthExpired;
    assert!(err.is_auth_expired());
    assert!(err.is_retryable());
}

#[tokio::test]
async fn test_error_taxonomy_network() {
    // Create a reqwest error by making a request to an invalid URL
    let client = reqwest::Client::new();
    let reqwest_err = client.get("http://[::]:1").send().await.unwrap_err();
    let err = EchoMirrorError::Network(reqwest_err);
    assert!(!err.is_auth_expired());
    assert!(err.is_retryable());
}

#[tokio::test]
async fn test_error_taxonomy_http_5xx() {
    let err = EchoMirrorError::Http {
        status: 503,
        message: "Service unavailable".to_string(),
    };
    assert!(!err.is_auth_expired());
    assert!(err.is_retryable());
}

#[tokio::test]
async fn test_error_taxonomy_http_4xx() {
    let err = EchoMirrorError::Http {
        status: 400,
        message: "Bad request".to_string(),
    };
    assert!(!err.is_auth_expired());
    assert!(!err.is_retryable());
}

#[tokio::test]
async fn test_error_taxonomy_rate_limit() {
    let err = EchoMirrorError::RateLimit {
        retry_after_secs: 60,
    };
    assert!(!err.is_auth_expired());
    assert!(err.is_retryable());
}

#[tokio::test]
async fn test_error_taxonomy_serialization() {
    let err = EchoMirrorError::Serialization(
        serde_json::from_str::<serde_json::Value>("invalid json").unwrap_err(),
    );
    assert!(!err.is_auth_expired());
    assert!(!err.is_retryable());
}

#[tokio::test]
async fn test_error_taxonomy_invalid_response() {
    let err = EchoMirrorError::InvalidResponse("Invalid JSON".to_string());
    assert!(!err.is_auth_expired());
    assert!(!err.is_retryable());
}

#[tokio::test]
async fn test_error_taxonomy_auth() {
    let err = EchoMirrorError::Auth("Invalid credentials".to_string());
    assert!(!err.is_auth_expired());
    assert!(!err.is_retryable());
}

#[tokio::test]
async fn test_request_timeout_override() {
    let mock_server = MockServer::start().await;

    // Simulate a slow response
    Mock::given(matchers::method("GET"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(&TestResponse {
                    message: "success".to_string(),
                })
                .set_delay(Duration::from_millis(100)),
        )
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_timeout(Duration::from_millis(50)); // Default timeout is 50ms

    let client = EchoMirrorClient::new(config).unwrap();

    // This should fail with default timeout
    let result: Result<TestResponse, EchoMirrorError> = client.get::<TestResponse>("/test").await;
    assert!(result.is_err());

    // This should succeed with override timeout
    let result = client
        .get_with_timeout::<TestResponse>("/test", Duration::from_millis(200))
        .await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap().message, "success");
}

#[tokio::test]
async fn test_max_retries_exceeded() {
    let mock_server = MockServer::start().await;

    // All requests fail with 503
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(2); // 2 retries = 3 total attempts

    let client = EchoMirrorClient::new(config).unwrap();

    let result: Result<TestResponse, EchoMirrorError> = client.get("/test").await;

    assert!(result.is_err());
    match result.unwrap_err() {
        EchoMirrorError::Http { status, .. } => {
            assert_eq!(status, 503);
        }
        _ => panic!("Expected Http error with status 503"),
    }
}
