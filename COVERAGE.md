# Coverage backlog

Per-package/crate test coverage, measured directly (not estimated), and a
prioritized backlog of what most needs a contributor's attention. See
[CONTRIBUTING.md](./CONTRIBUTING.md#your-first-pr) for how "pick something
here" fits into making your first PR.

Numbers below are from a local run on 2026-08-27 and will drift as the
codebase changes — the authoritative, current numbers are whatever CI last
measured: `js-ci.yml`'s `js-checks` job (`npm run coverage`, per JS package)
and `rust-ci.yml`'s `coverage` job (`cargo llvm-cov -p <crate>`, per Rust
crate). Re-run locally with the commands below before trusting this table
for anything more than "roughly where things stand."

```sh
# JS package, e.g. @echomirror/social
npm run coverage -w packages/js/social

# Rust crate, e.g. echomirror-sync
cargo llvm-cov -p echomirror-sync
```

## JS packages

| Package | Lines | CI-enforced floor | Notes |
|---|---|---|---|
| `@echomirror/mood` | 100% | 80% | Full unit test coverage in `tests/mood.test.ts`. |
| `@echomirror/react` | 100% | 80% | Full unit test coverage in `tests/react.test.tsx` (provider, profile, streak, SDK events). |
| `@echomirror/social` | 69% | 60% | `react.ts` (the hook) and `index.ts` (re-exports) are the two files dragging this down — everything else is 91%+. |
| `@echomirror/core` | 90% | 80% | Always-on offline unit tests in `tests/client.test.ts` (requests, errors, retry/backoff, timeout, middleware, events). |
| `@echomirror/stellar` (JS) | 78% | 70% | `wallets/albedo.ts` (45%) is the weak spot; other wallet adapters are 75-100%. |
| `@echomirror/analytics` | 92% | 85% | Healthiest JS package by a wide margin. |
| `@echomirror/wasm` | n/a | n/a | Not gated on source-line coverage — its correctness suite runs the compiled artifact across Node/Bun/Deno/browser instead (see its own [README](./packages/js/wasm/README.md#runtime-compatibility)). Its Rust crate's own unit tests (`crates/echomirror-wasm/src/lib.rs`) are covered below. |

## Rust crates

| Crate | Lines | CI-enforced floor | Notes |
|---|---|---|---|
| `echomirror-stellar` | **21%** | 15% | **Lowest in the workspace.** `balance.rs`, `friendbot.rs`, `transaction.rs` are all 0% — this crate's logic is mostly exercised indirectly via `echomirror-sync`'s integration tests rather than its own unit tests. |
| `echomirror-core` | 65% | 55% | `mood.rs` and `social.rs` (0% each) are thin HTTP-request wrappers with real logic covered by the JS/contract-test layer instead — see `mood.rs`/`social.rs` before assuming these need Rust-level tests; check whether a unit test actually adds signal beyond the contract tests first. `middleware.rs` (40%) is genuinely under-tested at the unit level (its integration coverage lives in `crates/echomirror-core/tests/middleware_tests.rs`, not counted as "unit" here). |
| `echomirror-wasm` | 61% | 55% | Its hand-written JS/TS wrapper (`packages/js/wasm/src/`) has its own separate, thorough suite — see the JS packages table above. |
| `echomirror-sync` | 77% | 70% | Healthiest Rust crate. `stream.rs` (0%) is the one clear gap — small file, good first Rust issue. |
| `echomirror-ffi` | not gated | — | Tested via Swift XCTest (`packages/swift/EchoMirrorSDK/Tests/`), which `cargo llvm-cov` can't see. Its own cargo-measured number would be misleadingly low and isn't in the CI gate. |
| `echomirror-python` | not gated | — | Tested via pytest (`crates/echomirror-python/tests/`), same reasoning as `echomirror-ffi`. |

## Backlog, prioritized

Roughly ordered by "most valuable first PR" — a mix of genuine gap size and
how safe/scoped the fix is for someone new to this codebase:

1. **`echomirror-stellar` (Rust)'s `balance.rs`, `friendbot.rs`,
   `transaction.rs` are 0%.** These wrap Horizon HTTP calls — look at
   `crates/echomirror-sync`'s `tests/common/horizon_fixture.rs` for the
   established pattern of mocking Horizon locally rather than hitting the
   real network.
2. **`@echomirror/social`'s `react.ts` hook is untested.** The non-React
   parts of this package (`feed.ts`, `leaderboard.ts`, `cache.ts`,
   `realtime.ts`) are all 91%+; the hook wrapping them is the gap.
3. **`echomirror-sync`'s `stream.rs` is 0%.** Small, self-contained file —
   a good first Rust issue in an otherwise well-tested crate.
4. **`echomirror-core`'s `middleware.rs` unit coverage.** The middleware
   pipeline (see its own doc comment for design) has thorough *integration*
   coverage in `tests/middleware_tests.rs`, but the `LoggingMiddleware`
   reference implementation itself has no direct unit test.

## Ecosystems not covered here

Python (`crates/echomirror-python`, via pytest) and Flutter/Dart
(`packages/flutter`) now have coverage tooling wired into CI:

- **Python**: `pytest-cov` with `--cov-fail-under=50` in `python-ci.yml`.
  Measured via `pytest --cov=echomirror --cov-report=term-missing`.
- **Flutter**: `flutter test --coverage` in `flutter-ci.yml`, with a 40%
  line-coverage threshold enforced on the `lcov.info` output.

See the per-ecosystem CI workflows for exact commands and thresholds.
