use echomirror_core::{
    CircuitBreakerConfig, CircuitState, EchoMirrorClient, EchoMirrorConfig, EchoMirrorError,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use wiremock::{matchers, Mock, MockServer, ResponseTemplate};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct TestResponse {
    message: String,
}

#[tokio::test]
async fn test_circuit_breaker_trips_after_threshold_and_fails_fast() {
    let mock_server = MockServer::start().await;

    // Server returns 503 Service Unavailable
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&mock_server)
        .await;

    // Threshold of 2 failures, cooldown 1s, retries 0
    let config = EchoMirrorConfig::new("test-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(0)
        .with_circuit_breaker(CircuitBreakerConfig {
            failure_threshold: 2,
            cooldown: Duration::from_secs(1),
            enabled: true,
        });

    let client = EchoMirrorClient::new(config).unwrap();

    // Request 1: fails with 503
    let res1: Result<TestResponse, EchoMirrorError> = client.get("/endpoint").await;
    assert!(res1.is_err());
    assert!(matches!(
        res1.unwrap_err(),
        EchoMirrorError::Http { status: 503, .. }
    ));
    assert_eq!(client.circuit_breaker().state().await, CircuitState::Closed);

    // Request 2: fails with 503, reaching threshold = 2 and tripping circuit to Open
    let res2: Result<TestResponse, EchoMirrorError> = client.get("/endpoint").await;
    assert!(res2.is_err());
    assert!(matches!(
        res2.unwrap_err(),
        EchoMirrorError::Http { status: 503, .. }
    ));
    assert_eq!(client.circuit_breaker().state().await, CircuitState::Open);

    // Request 3: fails immediately with CircuitOpen without contacting server
    let start = std::time::Instant::now();
    let res3: Result<TestResponse, EchoMirrorError> = client.get("/endpoint").await;
    let elapsed = start.elapsed();

    assert!(res3.is_err());
    let err = res3.unwrap_err();
    assert!(err.is_circuit_open());
    assert!(matches!(err, EchoMirrorError::CircuitOpen(_)));
    assert!(!err.is_retryable());
    assert!(elapsed < Duration::from_millis(50));

    let metrics = client.metrics();
    assert_eq!(metrics.circuit_state, CircuitState::Open);
    assert_eq!(metrics.circuit_trips, 1);
    assert_eq!(metrics.circuit_open_rejections, 1);
}

#[tokio::test]
async fn test_circuit_breaker_recovers_after_cooldown_and_successful_probe() {
    let mock_server = MockServer::start().await;

    // First 2 calls fail with 500
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(500))
        .up_to_n_times(2)
        .mount(&mock_server)
        .await;

    // Subsequent calls succeed with 200
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "recovered".to_string(),
        }))
        .mount(&mock_server)
        .await;

    // Short cooldown of 100ms for test
    let config = EchoMirrorConfig::new("test-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(0)
        .with_circuit_breaker(CircuitBreakerConfig {
            failure_threshold: 2,
            cooldown: Duration::from_millis(100),
            enabled: true,
        });

    let client = EchoMirrorClient::new(config).unwrap();

    // Trip the breaker
    let _ = client.get::<TestResponse>("/endpoint").await;
    let _ = client.get::<TestResponse>("/endpoint").await;
    assert_eq!(client.circuit_breaker().state().await, CircuitState::Open);

    // Immediate call fails fast
    let res = client.get::<TestResponse>("/endpoint").await;
    assert!(res.unwrap_err().is_circuit_open());

    // Wait for cooldown to expire
    tokio::time::sleep(Duration::from_millis(150)).await;

    // Probe request should transition to HalfOpen and succeed, closing the breaker
    let probe_res = client.get::<TestResponse>("/endpoint").await;
    assert!(probe_res.is_ok());
    assert_eq!(probe_res.unwrap().message, "recovered");
    assert_eq!(client.circuit_breaker().state().await, CircuitState::Closed);

    let metrics = client.metrics();
    assert_eq!(metrics.circuit_state, CircuitState::Closed);
    assert_eq!(metrics.circuit_trips, 1);
}

#[tokio::test]
async fn test_circuit_breaker_reopens_if_half_open_probe_fails() {
    let mock_server = MockServer::start().await;

    // All requests fail with 500
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(0)
        .with_circuit_breaker(CircuitBreakerConfig {
            failure_threshold: 1,
            cooldown: Duration::from_millis(100),
            enabled: true,
        });

    let client = EchoMirrorClient::new(config).unwrap();

    // Trip breaker
    let _ = client.get::<TestResponse>("/endpoint").await;
    assert_eq!(client.circuit_breaker().state().await, CircuitState::Open);

    // Wait for cooldown
    tokio::time::sleep(Duration::from_millis(150)).await;

    // Probe request fails
    let probe_res = client.get::<TestResponse>("/endpoint").await;
    assert!(probe_res.is_err());
    assert_eq!(client.circuit_breaker().state().await, CircuitState::Open);

    let metrics = client.metrics();
    assert_eq!(metrics.circuit_state, CircuitState::Open);
    assert_eq!(metrics.circuit_trips, 2);
}

#[tokio::test]
async fn test_client_4xx_errors_do_not_trip_circuit_breaker() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(404).set_body_string("Not found"))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(0)
        .with_circuit_breaker(CircuitBreakerConfig {
            failure_threshold: 2,
            cooldown: Duration::from_secs(1),
            enabled: true,
        });

    let client = EchoMirrorClient::new(config).unwrap();

    for _ in 0..5 {
        let res = client.get::<TestResponse>("/not-found").await;
        assert!(res.is_err());
        assert!(matches!(
            res.unwrap_err(),
            EchoMirrorError::Http { status: 404, .. }
        ));
    }

    assert_eq!(client.circuit_breaker().state().await, CircuitState::Closed);
    assert_eq!(client.metrics().circuit_trips, 0);
}
