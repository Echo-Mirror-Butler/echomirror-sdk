---
sidebar_position: 100
slug: /changelog
---

# Changelog

All notable changes to the EchoMirror SDK are documented here. Releases are grouped by date; each entry lists every package that was changed in that release.

## Unreleased

### Added

- **Cross-language contract test harness** — a shared `contract-spec.json` drives identical assertions through Rust, JS, Flutter, and Swift runners against a docker-compose fixture (`contract-tests/`).
- **Unified changelog page** aggregating release notes across all packages.

## 0.1.0 (August 2026)

Initial public release of the EchoMirror SDK.

### Rust

| Crate | Notes |
|---|---|
| `echomirror-core` | HTTP client, retry/backoff, auth token refresh, mood operations, social feed/leaderboard, metrics |
| `echomirror-stellar` | Stellar Horizon client, balance queries, transaction history, Echo transfer builder, Friendbot funding |
| `echomirror-sync` | Real-time blockchain sync engine (SSE streaming, cursor management, PostgreSQL cursor store) |
| `echomirror-wasm` | WebAssembly bindings for crypto, XDR, mood buffer, cursor helpers |
| `echomirror-ffi` | C-ABI shared library for Flutter, Swift, and Python consumers |
| `echomirror-python` | PyO3 native extension (`echomirror` pip package) |

### JavaScript

| Package | Notes |
|---|---|
| `@echomirror/core` | Base HTTP client, event bus, error hierarchy, TypeScript types |
| `@echomirror/mood` | Mood logging, streak tracking, summary, AI reflections |
| `@echomirror/react` | React provider and hooks (`useProfile`, `useMoodStreak`, `useSDKEvent`) |
| `@echomirror/stellar` | Stellar wallet adapters (Freighter, Albedo, XBull), transaction builders, retry logic |
| `@echomirror/social` | Global feed, leaderboard, WebSocket realtime, TTL cache, React hooks |
| `@echomirror/analytics` | Analytics client, aggregation, webhook transport, privacy controls |
| `@echomirror/wasm` | TypeScript wrapper over the Rust WASM module |

### Flutter

| Package | Notes |
|---|---|
| `echomirror_sdk` | `EchoMirror` singleton, `MoodClient`, `StellarClient`, `SocialClient` |

### Swift

| Package | Notes |
|---|---|
| `EchoMirrorSDK` | FFI-backed `MoodClient`, `StellarClient`, `SocialClient` via XCFramework |

### Docs

- Documentation site built with Docusaurus, covering quickstart guides for every binding, architecture overview, and auto-generated JS API reference.
