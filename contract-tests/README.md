# Contract-Test Harness

Shared, language-agnostic contract tests for the EchoMirror SDK bindings
(Rust, JS, Flutter, Swift). One fixture serves the *same* canned responses to
every binding; each binding runs its own small runner against it and asserts
the same logical values, so a field rename or path change in any language's
binding fails in CI instead of drifting silently.

```
contract-tests/
├── contract-spec.json        <-- single source of truth (canonical wire shape)
├── docker-compose.yml        <-- fixture-api (18080) + fixture-horizon (18081)
├── fixture/
│   ├── Dockerfile
│   └── server.py             <-- stdlib HTTP server, spec-driven
└── README.md
```

## The contract spec

`contract-spec.json` declares every operation a binding must satisfy:

- `target`: `api` (EchoMirror API, port 18080) or `horizon` (port 18081)
- `method` + `path`: the **exact** request line the fixture matches
  (query string is significant)
- `request.body`: optional JSON payload sent on `POST`
- `response.body`: the canned response served
- `assertions`: `{ field, eq, path? }` — dotted `path` navigates into the
  response (e.g. `entries.0.score`); fields are the canonical **snake_case**
  wire keys. Every binding is required to surface these values.
- `binding`: which language implementations the op applies to. Bindings whose
  SDK has no HTTP path for an op (e.g. Swift's FFI-generated mood client) are
  intentionally *not* listed.

## The fixture

`server.py` reads the spec and serves exactly the declared routes. Two roles
(`api`, `horizon`) run as separate processes because bindings talk to both.

Run it:

```bash
# Docker (as in CI)
docker compose -f contract-tests/docker-compose.yml up -d --build

# or plain Python for local iteration
FIXTURE_ROLE=api      python contract-tests/fixture/server.py   # :18080
FIXTURE_ROLE=horizon  python contract-tests/fixture/server.py   # :18081
```

An unknown request returns a 404 *listing the known routes* so a mismatched
path is immediately diagnosable.

## Runners

Each runner reads the shared spec, asserts the typed binding's output against
it, and **self-skips when the fixture is unreachable** (so per-language CI keeps
passing without the fixture). The contract workflow starts the fixture first and
waits for it, so a skip there means a real failure.

| Binding | Runner | Exercises |
|---|---|---|
| Rust | `crates/echomirror-core/tests/contract.rs`, `crates/echomirror-stellar/tests/contract.rs` | mood + social + stellar bindings incl. typed deserialization and error mapping |
| JS | `packages/js/core/tests/contract.test.ts` | `EchoMirrorClient` transport + spec-compliant mood/stellar wrappers |
| Flutter | `packages/flutter/test/contract_test.dart` | `EchoMirror.initialize` + Mood/Social/Stellar clients |
| Swift | `packages/swift/EchoMirrorSDK/Tests/EchoMirrorSDKTests/ContractTests.swift` | FFI validation/bridging semantics (no HTTP) |

Environment overrides (all default to the CI values):

- `ECHOMIRROR_CONTRACT_SPEC` — path to `contract-spec.json`
- `ECHOMIRROR_CONTRACT_API_BASE` — default `http://127.0.0.1:18080`
- `ECHOMIRROR_CONTRACT_HORIZON_BASE` — default `http://127.0.0.1:18081`

## Known drift (surfaced by this harness, not yet fixed upstream)

The harness intentionally asserts the **canonical** wire shape. Two JS
higher-level wrappers currently diverge from it and are therefore exercised at
the `EchoMirrorClient.request` level instead:

1. `@echomirror/stellar` `getTransactionHistory` sends the query param
   `publicKey` (camelCase); Rust and Flutter both send `public_key`.
2. `@echomirror/social` `LeaderboardClient.fetchLeaderboard` requests
   `?window=weekly` and expects a **bare array**, while the canonical route is
   `?limit=` returning `{ "entries": [...] }`.

Swift's FFI fixtures are also a known divergence: mood/social payloads are
generated inside `echomirror-ffi` rather than fetched over HTTP, and
`echomirror_stellar_get_balance_async` targets the real testnet Horizon because
there is no FFI hook to override the Horizon base URL. That op is documented as
out of scope until an FFI `horizon_url` override exists.