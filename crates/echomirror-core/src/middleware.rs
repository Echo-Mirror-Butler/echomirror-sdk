//! Request/response middleware pipeline for [`EchoMirrorClient`](crate::EchoMirrorClient).
//!
//! Lets an integrator hook into the request lifecycle without forking the
//! crate: inject headers, refresh auth on a 401 and retry, or emit
//! structured logs/traces tied into their own observability stack.
//!
//! # Ordering: once per HTTP attempt, not once per logical request
//!
//! [`RequestMiddleware::before_request`] and [`RequestMiddleware::after_response`]
//! run around **every** attempt the client makes for a logical request,
//! including retries triggered by the client's own retry/backoff logic. This
//! is a deliberate choice, not an accident of implementation order:
//!
//! - A logging/tracing middleware wants a span per attempt — "attempt 2 of 3,
//!   got a 503" is the useful signal, not just the final outcome.
//! - An auth-refresh middleware needs to see the 401 on the attempt it
//!   actually happened on, refresh, and ask for an immediate retry — it can't
//!   do that if it only runs once per logical request.
//!
//! Multiple middlewares run in the order they were registered via
//! [`EchoMirrorConfig::with_middleware`](crate::EchoMirrorConfig::with_middleware),
//! for both hooks. `after_response` short-circuits on the first middleware
//! that returns [`MiddlewareDecision::RetryNow`] — later middlewares in the
//! chain do not see that attempt's outcome.
//!
//! # Composing with retry/backoff
//!
//! `RetryNow` triggers an immediate retry (no backoff, and it does not count
//! against `EchoMirrorConfig::max_retries`), so it composes independently of
//! the existing exponential-backoff retry loop. A middleware-requested retry
//! is capped at [`MAX_MIDDLEWARE_RETRIES`] per logical request to guarantee
//! termination if a middleware misbehaves (e.g. a refresh callback that
//! always fails to produce a valid token).

use reqwest::header::HeaderMap;
use reqwest::{Method, StatusCode};
use std::time::Duration;

use crate::{EchoMirrorClient, EchoMirrorError};

/// Bound on middleware-requested retries per logical request, independent of
/// `max_retries`. Prevents a misbehaving middleware from looping forever.
pub const MAX_MIDDLEWARE_RETRIES: u32 = 3;

/// The outgoing request, as seen by middleware before it is sent.
#[derive(Debug)]
pub struct MiddlewareRequest {
    pub method: Method,
    pub url: String,
    pub headers: HeaderMap,
    /// JSON-encoded request body, if any. Mutating this changes what is sent.
    pub body: Option<Vec<u8>>,
    /// 1-based attempt number for this logical request (bumped on every
    /// retry, including middleware-requested ones).
    pub attempt: u32,
}

/// The response as seen by middleware, on the attempts that got one.
#[derive(Debug)]
pub struct MiddlewareResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
    pub duration: Duration,
}

/// What happened on this attempt, passed to `after_response`.
#[derive(Debug)]
pub enum MiddlewareOutcome<'a> {
    Response(&'a MiddlewareResponse),
    Error(&'a EchoMirrorError),
}

impl MiddlewareOutcome<'_> {
    pub fn status(&self) -> Option<StatusCode> {
        match self {
            MiddlewareOutcome::Response(r) => Some(r.status),
            MiddlewareOutcome::Error(_) => None,
        }
    }
}

/// What the client should do after a middleware's `after_response` hook runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MiddlewareDecision {
    /// Proceed with the client's normal retry/error handling for this outcome.
    #[default]
    Continue,
    /// Retry immediately: no backoff sleep, doesn't count against
    /// `max_retries`, capped at [`MAX_MIDDLEWARE_RETRIES`] per logical
    /// request. Typical use: a middleware refreshed credentials in response
    /// to a 401/`AuthExpired` and wants the request re-sent with them.
    RetryNow,
}

/// A hook into the client's request/response lifecycle.
///
/// Implementations get `&EchoMirrorClient` in both hooks so they have real
/// access to the client (e.g. `client.set_auth_token(..)` for token refresh),
/// not just the request/response data — that access is what makes an
/// end-to-end auth-refresh middleware possible instead of an abstract
/// interface that turns out to be too narrow in practice.
#[async_trait::async_trait]
pub trait RequestMiddleware: Send + Sync {
    /// Called before each attempt is sent. Mutate `req` to add/override
    /// headers or transform the body.
    async fn before_request(&self, _client: &EchoMirrorClient, _req: &mut MiddlewareRequest) {}

    /// Called after each attempt resolves, successfully or not.
    async fn after_response(
        &self,
        _client: &EchoMirrorClient,
        _req: &MiddlewareRequest,
        _outcome: &MiddlewareOutcome<'_>,
    ) -> MiddlewareDecision {
        MiddlewareDecision::Continue
    }
}

/// Reference middleware: structured per-attempt request logging via `tracing`.
///
/// Logs method, path, attempt number, status (or error), and duration —
/// everything a `RequestMiddleware` needs without reaching into the client's
/// internals. Register it with
/// [`EchoMirrorConfig::with_middleware`](crate::EchoMirrorConfig::with_middleware):
///
/// ```no_run
/// use echomirror_core::{EchoMirrorConfig, LoggingMiddleware};
///
/// let config = EchoMirrorConfig::new("api-key")
///     .with_middleware(LoggingMiddleware::new("my-app"));
/// ```
#[derive(Debug, Clone)]
pub struct LoggingMiddleware {
    /// Prefix included in every log line (e.g. the integrator's service name).
    target: String,
}

impl LoggingMiddleware {
    pub fn new(target: impl Into<String>) -> Self {
        Self {
            target: target.into(),
        }
    }
}

impl Default for LoggingMiddleware {
    fn default() -> Self {
        Self::new("echomirror-sdk")
    }
}

#[async_trait::async_trait]
impl RequestMiddleware for LoggingMiddleware {
    async fn before_request(&self, _client: &EchoMirrorClient, req: &mut MiddlewareRequest) {
        tracing::debug!(
            target: "echomirror::http",
            app = %self.target,
            method = %req.method,
            url = %req.url,
            attempt = req.attempt,
            "sending request",
        );
    }

    async fn after_response(
        &self,
        _client: &EchoMirrorClient,
        req: &MiddlewareRequest,
        outcome: &MiddlewareOutcome<'_>,
    ) -> MiddlewareDecision {
        match outcome {
            MiddlewareOutcome::Response(res) => {
                tracing::info!(
                    target: "echomirror::http",
                    app = %self.target,
                    method = %req.method,
                    url = %req.url,
                    attempt = req.attempt,
                    status = res.status.as_u16(),
                    duration_ms = res.duration.as_millis() as u64,
                    "request completed",
                );
            }
            MiddlewareOutcome::Error(err) => {
                tracing::warn!(
                    target: "echomirror::http",
                    app = %self.target,
                    method = %req.method,
                    url = %req.url,
                    attempt = req.attempt,
                    error = %err,
                    "request failed",
                );
            }
        }
        MiddlewareDecision::Continue
    }
}
