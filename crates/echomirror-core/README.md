# echomirror-core

[![crates.io](https://img.shields.io/crates/v/echomirror-core?color=ce422b&style=flat-square)](https://crates.io/crates/echomirror-core)
[![docs.rs](https://img.shields.io/badge/docs.rs-echomirror--core-ce422b?style=flat-square)](https://docs.rs/echomirror-core)

The foundation of the [EchoMirror SDK](https://github.com/Echo-Mirror-Butler/echomirror-sdk):
the authenticated API client, the shared domain types, the configuration object,
and the error taxonomy every other crate maps into.

```toml
[dependencies]
echomirror-core = "0.1"
```

## What's in it

| Item | Purpose |
| --- | --- |
| `EchoMirrorClient` | `get`/`post`/`delete` with retry + exponential backoff, per-request timeout overrides, token refresh, request/response middleware, an ETag response cache, a circuit breaker, and Prometheus-style metrics |
| `EchoMirrorConfig` | API key, base URL, network, timeout, retries, plus Horizon/Friendbot URL overrides for self-hosted nodes and tests |
| `EchoMirrorError` | The single error type, with `is_retryable()` / `is_auth_expired()` / `is_circuit_open()` so callers retry the right things |
| Types | `MoodEntry`, `MoodStreak`, `MoodSummary`, `StellarBalance`, `StellarTransaction`, `UserProfile`, `GlobalFeedEntry`, `LeaderboardEntry`, and the sync event types |
| Submodules | `mood`, `social`, `middleware`, `cache`, `circuit_breaker`, `metrics` |

```rust
use echomirror_core::{EchoMirrorClient, EchoMirrorConfig};

let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("your_api_key"))?;
client.set_auth_token(Some("user_jwt".into())).await;
```

## Notes

- MSRV: 1.85.
- Crates on crates.io are versioned together with `echomirror-stellar`,
  `echomirror-sync` and `echomirror-wasm`; see the workspace `Cargo.toml`.
- This crate is a dependency of `echomirror-stellar`, `echomirror-sync`,
  `echomirror-ffi` and `echomirror-python` — none of the JS/npm, Flutter or
  Swift packages depend on it directly.

## License

MIT — see the repository [LICENSE](https://github.com/Echo-Mirror-Butler/echomirror-sdk/blob/main/LICENSE).
