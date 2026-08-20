# @echomirror/wasm

## 0.1.0 — 2026-08-19

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
