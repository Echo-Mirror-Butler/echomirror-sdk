# Contributing to EchoMirror SDK

Welcome — we're building an open SDK for mood, wellness, and Stellar payments. Every contribution earns points on the Stellar Wave program.

## Ways to contribute

- **New features** — pick an open issue labeled `good first issue` or `help wanted`
- **Bug fixes** — check open issues or open one if you've found something
- **Examples** — add a new example app in `examples/`
- **Documentation** — improve the README, add inline JSDoc, fix typos
- **Flutter** — expand the Dart SDK in `packages/flutter/`

## Setup

```bash
git clone https://github.com/Echo-Mirror-Butler/echomirror-sdk.git
cd echomirror-sdk
./scripts/bootstrap.sh
```

`scripts/bootstrap.sh` is the recommended way to get set up: it checks your
Node/Rust/Flutter/Python toolchains, installs `wasm-pack` and `maturin` when
Rust/Python are present, installs each ecosystem's dependencies, and runs a
fast self-check per ecosystem so you find out immediately if something's
broken instead of three steps into your first change. It only warns (not
fails) on a missing toolchain, and it's safe to re-run. Windows contributors
should run it from WSL.

If you'd rather do it by hand, or just work on one ecosystem, the equivalent
manual steps are:

```bash
# JavaScript packages
npm install
npm run build
npm run test

# Rust workspace
cargo build --workspace
cargo test --workspace

# Flutter package
cd packages/flutter
flutter pub get
flutter test
```

## Package structure

Each JS package lives in `packages/js/<name>/` with:
```
src/
  index.ts        # public exports only
  *.ts            # implementation
tests/
  *.test.ts
package.json
tsconfig.json
README.md
```

The Flutter package lives in `packages/flutter/` following standard Dart conventions.

## Guidelines

- **TypeScript**: strict mode, no `any`, export types from `index.ts`
- **Dart**: follow `flutter_lints`, document public APIs with `///`
- **Tests**: every new function needs at least one test
- **No breaking changes** to existing public APIs without a major version bump
- **Commits**: use conventional commits — `feat:`, `fix:`, `docs:`, `test:`

## Which package should I start with?

Ranked by domain complexity — verified against each package's actual size and
what it depends on (line counts, dependency count, and whether it needs
domain-specific knowledge like Stellar signing or SSE streaming), not
guessed:

| Complexity | Package | Why |
|---|---|---|
| **Low** | `@echomirror/core` (JS) | 287 lines, zero runtime dependencies. Thin HTTP client wrapper — the lowest-risk, most foundational package, and the one used in the walkthrough below. |
| **Low** | `@echomirror/mood` (JS) | 124 lines, one dependency. Also currently has **zero tests** — see [COVERAGE.md](./COVERAGE.md), a good first issue in itself. |
| **Low-Medium** | `@echomirror/react` (JS) | 142 lines, but needs React hooks familiarity. Also has zero tests. |
| **Medium** | `@echomirror/analytics` (JS) | 721 lines, zero runtime dependencies, but more surface area (aggregation, privacy, storage, transport as separate concerns). |
| **Medium** | `@echomirror/social` (JS) | 739 lines. The non-realtime parts (feed, leaderboard, cache) are approachable; the WebSocket reconnect/backfill logic in `realtime.ts` is not a first-issue task. |
| **High** | `@echomirror/stellar` (JS) | 1,778 lines, 6 dependencies (wallet adapters: Albedo, Freighter, Ledger, xBull). Needs Stellar transaction/signing domain knowledge. |
| **Low-Medium** | `echomirror-core` (Rust) | 1,500 lines, but well-factored into small modules (`client.rs`, `config.rs`, `error.rs`, `middleware.rs`) — a good first *Rust* issue if you're new to the crate but not to Rust. |
| **High** | `echomirror-stellar` (Rust) | Smaller (435 lines) but wraps Horizon's API surface directly — needs the same Stellar domain knowledge as the JS package. |
| **High** | `echomirror-sync` (Rust) | 1,571 lines. SSE streaming, resumable cursors, backoff/reconnect, gap backfill — the most architecturally complex crate in the workspace. Not a first-issue package. |
| **Medium-High** | `echomirror-wasm` (Rust + JS) | Small source, but the build pipeline (`wasm-pack`, two build targets, cross-runtime testing) has more moving parts than the code itself. |

If you're picking up a `good first issue` and it's not obviously scoped to
one of the "Low" packages above, ask before starting — better to confirm
than to spend an evening on something that turns out to need `sync`-level
context.

## Your first PR

A concrete, start-to-finish example: fixing something small in
`@echomirror/core` (the package this repo is most set up to make approachable).

1. **Pick an issue.** Filter for [`good first issue`](https://github.com/Echo-Mirror-Butler/echomirror-sdk/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
   — see the package ranking above before picking one outside `core`/`mood`.
   [COVERAGE.md](./COVERAGE.md#backlog-prioritized) is also a good source of
   concrete, scoped first issues if nothing in the issue tracker fits. (There's
   no dedicated issue template yet — that's tracked in
   [#67](https://github.com/Echo-Mirror-Butler/echomirror-sdk/issues/67) —
   so just describe what you're fixing and why in plain prose.)
2. **Set up.** `git clone` your fork, then `./scripts/bootstrap.sh` — it
   checks your toolchains, installs dependencies, and runs a fast self-check
   per ecosystem so a broken setup surfaces immediately, not three steps into
   your change. (If you're only touching JS, the manual `npm install && npm
   run build && npm run test` from [Setup](#setup) above works too.)
3. **Branch and change.** `git checkout -b fix/your-fix`. Make the change in
   `packages/js/core/src/`, following the existing style — no new
   abstractions for a small fix, tests colocated in `packages/js/core/tests/`.
4. **Add a test.** Every new function needs at least one
   (see [Guidelines](#guidelines)). Run it locally:
   ```sh
   npm run test -w packages/js/core
   npm run coverage -w packages/js/core   # optional locally; CI enforces this — see COVERAGE.md
   npm run typecheck -w packages/js/core
   npm run lint -w packages/js/core
   ```
5. **Check your diff size before pushing.** `pr_guard.yml` warns above **600**
   changed lines and **fails the check** above **3,000** (bypassable only with
   a maintainer-applied `large-pr-approved` label — don't expect to self-apply
   it). A typical first PR for a small fix or a handful of new tests is nowhere
   near this; if you're approaching it, you're probably doing more than one
   logical change and should split the PR.
6. **Open the PR** against `main`, describing what changed and why.

### What CI actually looks like

Opening a PR runs several GitHub Actions checks — `JS CI`, `Rust CI`
(only if you touched Rust), the PR size guard above, and a few others
depending on what you changed. Here's a real, fully green `JS CI` run so you
know what "passing" looks like before you push:
<https://github.com/Echo-Mirror-Butler/echomirror-sdk/actions/runs/33096445699>.
Most JS-only PRs finish CI in a couple of minutes; a Rust change that touches
`echomirror-wasm` takes longer (it rebuilds the wasm-pack output twice and
runs it across Node, Bun, Deno, and headless Chromium — see that package's
[README](./packages/js/wasm/README.md#runtime-compatibility)).

All PRs are reviewed within 48 hours. Contributors earn Stellar Wave points for merged PRs.

## Questions?

Open a GitHub Discussion or join the Discord at https://discord.gg/echomirror.
