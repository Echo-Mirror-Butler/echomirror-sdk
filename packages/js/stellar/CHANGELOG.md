# @echomirror/stellar

## 0.2.0 — 2026-08-19

### Added

- Multi-wallet adapter: Freighter, Albedo, and xBull — unified `connect()` / `sign()` interface
- `getBalance(client, publicKey)` — XLM + ECHO token balance via Horizon, no API round-trip
- `sendEcho(client, params)` — build, sign, and submit ECHO token payment in one call
- `fundTestnetAccount(publicKey)` — Friendbot wrapper for testnet accounts
- `isValidStellarAddress(address)` — Ed25519 address validation (pure, no network call)
- Typed error hierarchy: `StellarConnectionError`, `InsufficientFundsError`, `TransactionError`, and more (17 typed subclasses)
- Retry middleware with configurable exponential back-off
- Playwright e2e tests for Freighter wallet flow

## 0.1.0 — 2026-07-01

### Added

- Initial release with basic Freighter wallet integration and XLM balance queries
