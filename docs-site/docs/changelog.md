---
sidebar_position: 5
title: Changelog
description: Aggregated changelog for all EchoMirror SDK packages — auto-generated from per-package CHANGELOG.md files.
---

# Changelog

All notable changes across every EchoMirror SDK package are listed here in
reverse-chronological order, grouped by release date and tagged by package.

This page is **auto-generated** at docs-build time from the individual
`CHANGELOG.md` files in each package directory. Do not edit it manually —
your changes will be overwritten on the next build.

> 📡 **Subscribe** — an RSS feed for this changelog is available at
> [changelog/rss.xml](https://karanjadavi.github.io/echomirror-sdk/changelog/rss.xml)
> once the blog plugin is enabled.

_Last generated: 2026-08-28_

---

## 2026-08-19

### @echomirror/analytics `npm` — v0.1.0


### Added

- Initial release of `@echomirror/analytics`
- `AnalyticsClient` — privacy-safe emotional UX event tracker; no PII by default
- `track(event, properties)` — fire-and-forget event emission with local queue + flush
- `aggregate(events)` — client-side aggregation (counts, averages, percentiles) before upload
- Configurable transports: `HttpTransport` (batched POST) and `NoopTransport` (testing)
- `PrivacyFilter` — strip or hash any property keys matching a configurable deny-list
- `LocalStorageQueue` — persists unsent events across page reloads; configurable max size
- Fully standalone — zero dependencies on other `@echomirror/*` packages
- ESM-only build (`"type": "module"`)

### @echomirror/core `npm` — v0.1.0


### Added

- Initial release of `@echomirror/core`
- `EchoMirrorClient` with API key and JWT auth, configurable base URL and network (`testnet` / `mainnet`)
- `EchoMirrorConfig` builder with `testnet()` / `mainnet()` convenience constructors
- Shared TypeScript types: `MoodEntry`, `StellarBalance`, `EchoUser`, `ApiResponse`, `EchoMirrorError`
- `setAuthToken` / `clearAuthToken` for runtime JWT management
- Full ESM + CJS dual-build via `tsconfig`

### @echomirror/mood `npm` — v0.1.0


### Added

- Initial release of `@echomirror/mood`
- `logMood(client, entry)` — record a mood entry (score 1–10, optional note and tags)
- `getMoodHistory(client, options)` — paginated mood history with date-range filtering
- `getMoodStreak(client)` — current and longest daily-logging streak
- `getAIReflection(client, entryId)` — fetch the AI-generated reflection for a mood entry
- `deleteMoodEntry(client, id)` — remove a mood entry by ID
- Full type coverage with `MoodEntry`, `MoodStreak`, `MoodHistoryOptions`

### @echomirror/react `npm` — v0.1.0


### Added

- Initial release of `@echomirror/react`
- `<EchoMirrorProvider>` — top-level context provider; accepts `apiKey` and `config`
- `useEchoMirror()` — access the underlying `EchoMirrorClient` anywhere in the tree
- `useMoodStreak()` — auto-fetching hook for the current user's streak with loading / error states
- `useStellarBalance(publicKey)` — reactive hook for XLM + ECHO balance
- React 18 and React 19 compatible; peer dependency `react >= 18.0.0`

### @echomirror/social `npm` — v0.1.0


### Added

- Initial release of `@echomirror/social`
- `getGlobalFeed(client, options)` — paginated global mood feed
- `getLeaderboard(client, period)` — weekly / monthly / all-time streak leaderboard
- `followUser(client, userId)` / `unfollowUser(client, userId)` — social graph management
- `getFeed(client, options)` — personalised feed from followed users
- Real-time feed updates via `FeedSubscription` (SSE-backed)
- In-memory LRU cache for leaderboard results; configurable TTL
- Optional React helpers (`useFeed`, `useLeaderboard`) — tree-shaken, peer-dep on React

### @echomirror/stellar `npm` — v0.2.0


### Added

- Multi-wallet adapter: Freighter, Albedo, and xBull — unified `connect()` / `sign()` interface
- `getBalance(client, publicKey)` — XLM + ECHO token balance via Horizon, no API round-trip
- `sendEcho(client, params)` — build, sign, and submit ECHO token payment in one call
- `fundTestnetAccount(publicKey)` — Friendbot wrapper for testnet accounts
- `isValidStellarAddress(address)` — Ed25519 address validation (pure, no network call)
- Typed error hierarchy: `StellarConnectionError`, `InsufficientFundsError`, `TransactionError`, and more (17 typed subclasses)
- Retry middleware with configurable exponential back-off
- Playwright e2e tests for Freighter wallet flow

### @echomirror/wasm `npm` — v0.1.0


### Added

- Initial release of `@echomirror/wasm`
- Dual-target wasm-pack build: `wasm-web` (browser ESM) and `wasm-node` (CJS for Node.js)
- `isValidStellarAddress(address)` — pure Ed25519 validation, no network call
- `hashPublicKey(publicKey)` — SHA-256 hex digest of a Stellar public key
- `serializeSyncCursor(cursor)` / `deserializeSyncCursor(bytes)` — XDR-compatible cursor serialisation for the sync engine
- `encryptMoodPayload(data, key)` / `decryptMoodPayload(cipher, key)` — AES-GCM encryption helpers
- Automatic environment detection: loads WASM binary from correct path in browser vs Node.js
- `WasmLoadError` with cause chain for clean error handling
- Bundle size: `wasm-web` ~120 kB gzipped; `wasm-node` ~115 kB

## 2026-07-01

### @echomirror/stellar `npm` — v0.1.0


### Added

- Initial release with basic Freighter wallet integration and XLM balance queries

---

## Packages without changelogs yet

The following packages do not yet have a `CHANGELOG.md` file and are excluded
from this page. Once they adopt Changesets (JS) or start maintaining a
`CHANGELOG.md` alongside their `Cargo.toml` / `pubspec.yaml`, entries will
appear here automatically:

- `echomirror-core`
- `echomirror-ffi`
- `echomirror-python`
- `echomirror-stellar`
- `echomirror-sync`
- `echomirror-wasm`
- `echomirror_sdk (Flutter)`

> **Rust crates** — the source of truth for versioning is `Cargo.toml`. Until
> `CHANGELOG.md` files are added to each crate, refer to the [GitHub Releases](https://github.com/Echo-Mirror-Butler/echomirror-sdk/releases)
> page for historical change notes.
>
> **Flutter** — `pubspec.yaml` tracks the version; a `CHANGELOG.md` will be
> added once pub.dev publishing is set up.
