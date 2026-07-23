use echomirror_core::EchoMirrorError;
use pyo3::exceptions::PyException;
use pyo3::{create_exception, PyErr};

// Base exception for everything raised by the SDK, mirroring the error
// hierarchy already exposed by the JS (`EchoMirrorError`/`AuthError`/...)
// and Flutter (`EchoMirrorError`/`EchoMirrorAuthError`/...) packages.
create_exception!(_echomirror, EchoMirrorException, PyException);
create_exception!(_echomirror, AuthError, EchoMirrorException);
create_exception!(_echomirror, NetworkError, EchoMirrorException);
create_exception!(_echomirror, RateLimitError, EchoMirrorException);
create_exception!(_echomirror, NotFoundError, EchoMirrorException);
create_exception!(_echomirror, ConfigError, EchoMirrorException);

/// Map a Rust-side `EchoMirrorError` onto the matching Python exception type.
pub fn to_py_err(err: EchoMirrorError) -> PyErr {
    match err {
        EchoMirrorError::Auth(msg) => AuthError::new_err(msg),
        EchoMirrorError::AuthExpired => AuthError::new_err("Authentication token expired"),
        EchoMirrorError::RateLimit { retry_after_secs } => RateLimitError::new_err(format!(
            "Rate limit exceeded — retry after {retry_after_secs}s"
        )),
        EchoMirrorError::Network(e) => NetworkError::new_err(e.to_string()),
        EchoMirrorError::NotFound(msg) => NotFoundError::new_err(msg),
        EchoMirrorError::Config(msg) => ConfigError::new_err(msg),
        EchoMirrorError::Http {
            status: 404,
            message,
        } => NotFoundError::new_err(message),
        other => EchoMirrorException::new_err(other.to_string()),
    }
}
