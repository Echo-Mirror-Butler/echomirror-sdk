use async_trait::async_trait;
use echomirror_core::{
    EchoMirrorClient, EchoMirrorConfig, MiddlewareDecision, MiddlewareOutcome, MiddlewareRequest,
    RequestMiddleware,
};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use wiremock::{matchers, Mock, MockServer, ResponseTemplate};

#[derive(Debug, Serialize, Deserialize)]
struct TestResponse {
    message: String,
}

/// End-to-end: a middleware sees a 401, refreshes credentials via
/// `client.set_auth_token`, and asks for an immediate retry — the retried
/// request goes out with the new token and succeeds. This is the exact
/// scenario in #132's acceptance criteria, not just "the hook fires".
struct AuthRefreshMiddleware {
    refreshed: Arc<AtomicU32>,
}

#[async_trait]
impl RequestMiddleware for AuthRefreshMiddleware {
    async fn after_response(
        &self,
        client: &EchoMirrorClient,
        _req: &MiddlewareRequest,
        outcome: &MiddlewareOutcome<'_>,
    ) -> MiddlewareDecision {
        if outcome.status() == Some(StatusCode::UNAUTHORIZED) {
            self.refreshed.fetch_add(1, Ordering::SeqCst);
            client.set_auth_token(Some("refreshed-token".to_string())).await;
            return MiddlewareDecision::RetryNow;
        }
        MiddlewareDecision::Continue
    }
}

#[tokio::test]
async fn middleware_refreshes_auth_and_retries_end_to_end() {
    let mock_server = MockServer::start().await;

    // Rejects the stale token, accepts the refreshed one.
    Mock::given(matchers::method("GET"))
        .and(matchers::header("authorization", "Bearer stale-token"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock_server)
        .await;
    Mock::given(matchers::method("GET"))
        .and(matchers::header("authorization", "Bearer refreshed-token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "ok".to_string(),
        }))
        .mount(&mock_server)
        .await;

    let refreshed = Arc::new(AtomicU32::new(0));
    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_middleware(AuthRefreshMiddleware {
            refreshed: refreshed.clone(),
        });

    let client = EchoMirrorClient::new(config).unwrap();
    client.set_auth_token(Some("stale-token".to_string())).await;

    let result = client.get::<TestResponse>("/test").await;

    assert!(result.is_ok(), "expected success, got {:?}", result.err());
    assert_eq!(result.unwrap().message, "ok");
    assert_eq!(refreshed.load(Ordering::SeqCst), 1);
}

/// A middleware that never manages to fix the 401 must not loop forever.
struct AlwaysRetryMiddleware;

#[async_trait]
impl RequestMiddleware for AlwaysRetryMiddleware {
    async fn after_response(
        &self,
        _client: &EchoMirrorClient,
        _req: &MiddlewareRequest,
        outcome: &MiddlewareOutcome<'_>,
    ) -> MiddlewareDecision {
        if outcome.status() == Some(StatusCode::UNAUTHORIZED) {
            return MiddlewareDecision::RetryNow;
        }
        MiddlewareDecision::Continue
    }
}

#[tokio::test]
async fn middleware_retry_loop_is_bounded() {
    let mock_server = MockServer::start().await;
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock_server)
        .await;

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_middleware(AlwaysRetryMiddleware);

    let client = EchoMirrorClient::new(config).unwrap();

    let result = client.get::<TestResponse>("/test").await;
    assert!(result.is_err(), "an always-retrying middleware must eventually give up");
}

/// Multiple middlewares run in registration order for both hooks.
#[tokio::test]
async fn middlewares_run_in_registration_order() {
    let mock_server = MockServer::start().await;
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "ok".to_string(),
        }))
        .mount(&mock_server)
        .await;

    let order = Arc::new(Mutex::new(Vec::<&'static str>::new()));

    struct OrderRecorder {
        name: &'static str,
        order: Arc<Mutex<Vec<&'static str>>>,
    }

    #[async_trait]
    impl RequestMiddleware for OrderRecorder {
        async fn before_request(&self, _client: &EchoMirrorClient, _req: &mut MiddlewareRequest) {
            self.order.lock().unwrap().push(self.name);
        }

        async fn after_response(
            &self,
            _client: &EchoMirrorClient,
            _req: &MiddlewareRequest,
            _outcome: &MiddlewareOutcome<'_>,
        ) -> MiddlewareDecision {
            self.order.lock().unwrap().push(self.name);
            MiddlewareDecision::Continue
        }
    }

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_middleware(OrderRecorder {
            name: "first",
            order: order.clone(),
        })
        .with_middleware(OrderRecorder {
            name: "second",
            order: order.clone(),
        });

    let client = EchoMirrorClient::new(config).unwrap();
    let result = client.get::<TestResponse>("/test").await;
    assert!(result.is_ok());

    assert_eq!(
        *order.lock().unwrap(),
        vec!["first", "second", "first", "second"]
    );
}

/// A middleware can add a custom header that the server actually receives.
#[tokio::test]
async fn middleware_can_add_headers() {
    let mock_server = MockServer::start().await;
    Mock::given(matchers::method("GET"))
        .and(matchers::header("x-trace-id", "trace-123"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "ok".to_string(),
        }))
        .mount(&mock_server)
        .await;

    struct TraceHeaderMiddleware;

    #[async_trait]
    impl RequestMiddleware for TraceHeaderMiddleware {
        async fn before_request(&self, _client: &EchoMirrorClient, req: &mut MiddlewareRequest) {
            req.headers.insert(
                "x-trace-id",
                reqwest::header::HeaderValue::from_static("trace-123"),
            );
        }
    }

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_middleware(TraceHeaderMiddleware);

    let client = EchoMirrorClient::new(config).unwrap();
    let result = client.get::<TestResponse>("/test").await;
    assert!(result.is_ok(), "expected success, got {:?}", result.err());
}

/// Retries triggered by the existing backoff/retry loop (not middleware) also
/// re-run middleware for each attempt, so a logging middleware sees every one.
#[tokio::test]
async fn middleware_runs_once_per_attempt_including_backoff_retries() {
    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(2)
        .mount(&mock_server)
        .await;
    Mock::given(matchers::method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&TestResponse {
            message: "ok".to_string(),
        }))
        .mount(&mock_server)
        .await;

    let attempts_seen = Arc::new(Mutex::new(Vec::<u32>::new()));

    struct AttemptRecorder {
        attempts: Arc<Mutex<Vec<u32>>>,
    }

    #[async_trait]
    impl RequestMiddleware for AttemptRecorder {
        async fn before_request(&self, _client: &EchoMirrorClient, req: &mut MiddlewareRequest) {
            self.attempts.lock().unwrap().push(req.attempt);
        }
    }

    let config = EchoMirrorConfig::new("test-api-key")
        .with_base_url(mock_server.uri())
        .with_max_retries(3)
        .with_middleware(AttemptRecorder {
            attempts: attempts_seen.clone(),
        });

    let client = EchoMirrorClient::new(config).unwrap();
    let result = client.get::<TestResponse>("/test").await;
    assert!(result.is_ok());
    assert_eq!(*attempts_seen.lock().unwrap(), vec![1, 2, 3]);
}
