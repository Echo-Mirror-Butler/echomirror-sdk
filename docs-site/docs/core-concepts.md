---
sidebar_position: 2
---

# Core Concepts

## Architecture

EchoMirror SDK is built as layers, with a shared Rust core at the bottom and idiomatic language bindings on top.

```
                        EchoMirror API
              (auth, mood, AI reflections, social)
                            HTTP/REST
                     Rust Core Layer

  echomirror-core   echomirror-stellar   echomirror-sync
  client, types,    Horizon client,      streaming ledger
  error handling,   balance queries,     sync engine,
  config, auth      tx building,         resumable cursors,
                    Friendbot            event broadcast

  echomirror-wasm           echomirror-ffi
  WASM for browser          C-ABI .so/.dylib/.dll
  and Node.js               for Flutter, Swift, Python
  wasm-bindgen              dart:ffi / ctypes / swift-ffi

  JS/TS packages              Native packages
  @echomirror/core,mood,      echomirror_sdk (Flutter/Dart)
  stellar,social,analytics,   echomirror-python (coming)
  react,wasm,widget           EchoMirrorSDK - Swift (coming)
```

## How echomirror-core relates to the platform bindings

`echomirror-core` owns the HTTP client, auth token handling, request/response types, and error types shared by every language binding. Nothing above it re-implements networking or crypto - each platform binding is a thin, idiomatic wrapper:

- **`@echomirror/*` (JS/TS)** wraps `echomirror-wasm`, a WebAssembly build of the Rust core, via `wasm-bindgen`.
- **`echomirror_sdk` (Flutter/Dart)** and the upcoming Python/Swift bindings wrap `echomirror-ffi`, a C-ABI shared library, via `dart:ffi` / `ctypes` / Swift FFI respectively.
- **Native Rust backends** depend on `echomirror-core`, `echomirror-stellar`, and `echomirror-sync` directly - no FFI boundary at all.

This means a fix or new feature landing in the Rust core propagates to every platform without being reimplemented per-language.

## The sync engine

`echomirror-sync` (Rust) and `BlockchainSyncClient` (Flutter) provide a streaming, resumable, fault-tolerant Stellar blockchain sync engine. In Rust:

1. **SSE streaming** - one long-lived Horizon Server-Sent Events connection per watched account; no polling.
2. **Resumable cursors** - the engine saves a `SyncCursor` (ledger sequence + paging token) after every processed record. Restart the engine anytime and it resumes exactly where it left off - no re-scanning.
3. **Automatic reconnect** - dropped or idle streams reconnect with full-jitter exponential backoff, resuming from the last persisted cursor.
4. **Gap backfill** - on every (re)connect the engine pages from the persisted cursor to the tip before attaching the live stream, so downtime never loses events; numeric paging-token dedup guarantees each record is emitted exactly once.
5. **Filters** - only emit events matching your rules: specific accounts, assets (`ECHO`/`XLM`), minimum amounts, memo prefixes.
6. **Multi-account** - watch many accounts in a single engine instance (one SSE connection each).
7. **Event types** - `TransactionDetected`, `SyncStarted`, `SyncPaused`, `SyncCompleted`, `Error`, plus opt-in `LedgerClosed` via `.watch_ledgers(true)`.
8. **Operational visibility** - `engine.metrics()` reports cursor lag, reconnects, dedup drops, backfill volume, and cursor-save failures.

For PostgreSQL persistence, enable the crate's `postgres` feature and use the built-in `PgCursorStore` (embedded schema migrations, connection pooling, upsert saves). To persist cursors anywhere else (e.g. Redis), implement the `CursorStore` trait - both methods return `Result`, and storage failures surface as `EchoMirrorError::Sync`:

```rust
use echomirror_core::Result;
use echomirror_sync::{CursorStore, SyncCursor};
use async_trait::async_trait;

struct RedisCursorStore { client: redis::Client }

#[async_trait]
impl CursorStore for RedisCursorStore {
    async fn load(&self, account: &str) -> Result<Option<SyncCursor>> {
        // load from Redis
    }
    async fn save(&self, account: &str, cursor: &SyncCursor) -> Result<()> {
        // save to Redis
    }
}

let engine = SyncEngine::builder(&client)
    .watch("GPUBLIC_KEY")
    .cursor_store(Arc::new(RedisCursorStore { client }))
    .build();
```

## Wallet integration model

Wallet connections are handled per-platform rather than in the shared core, since wallet APIs differ fundamentally across environments:

- **Web** connects via the Freighter browser extension (`connectFreighter()` in `@echomirror/stellar`).
- **Flutter/native** platforms manage keys directly or integrate with platform-specific wallet SDKs, then pass the resulting public key into the shared balance/transaction APIs.

Once a public key is available, balance queries, transaction building, and ECHO transfers all go through the same `echomirror-stellar` logic regardless of how the key was obtained.
