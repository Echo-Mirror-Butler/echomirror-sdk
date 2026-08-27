# @echomirror/wasm

The `echomirror-wasm` Rust crate compiled to WebAssembly, wrapped in a hand-written,
ergonomic TypeScript API — dual-target for the browser and Node.js from a single
`wasm-pack` build pipeline.

```ts
import { init, verifyMoodScore, hashPublicKey, MoodBuffer } from '@echomirror/wasm'

await init() // instantiates the wasm module (no-op in Node, fetches in browser)

verifyMoodScore(7) // true

using buffer = new MoodBuffer()
buffer.push(7)
buffer.push(9)
buffer.average() // 8
// freed automatically at the end of this scope
```

## Build

```sh
npm run build:wasm -w packages/js/wasm   # cargo + wasm-pack, both targets, wasm-opt
npm run build -w packages/js/wasm        # tsc: compiles src/ -> dist/
```

`build:wasm` runs `wasm-pack build` twice against the same `crates/echomirror-wasm`
crate — once with `--target web` (browser ESM, `wasm-web/`) and once with
`--target nodejs` (CommonJS, `wasm-node/`, renamed to `.cjs` so Node's ESM loader
doesn't misinterpret it under this package's `"type": "module"`). Both runs apply
`wasm-opt -O4`, configured via `[package.metadata.wasm-pack.profile.release]` in the
crate's `Cargo.toml`.

`dist/` (the hand-written wrapper) resolves the right raw binding at runtime via the
`"#wasm-binding"` entry in `package.json#imports`, keyed on the `node` / `browser`
condition — see [`src/load.ts`](./src/load.ts).

Run `WASM_BUILD_DEV=1 npm run build:wasm` for a faster, unoptimized `--dev` build
during local iteration.

## Bundle size

```sh
npm run size -w packages/js/wasm
```

Measured `.wasm` output (both targets are byte-identical — same crate, same
`wasm-opt` pass, only the JS glue differs):

| | raw | gzipped |
|---|---|---|
| `echomirror_wasm_bg.wasm` | 60.6 KB | ~26 KB |

Budget is set at **250 KB raw** in [`scripts/report-size.mjs`](./scripts/report-size.mjs),
with headroom above the measured size — the point is to catch a real regression (e.g.
an accidentally-added heavy dependency) in CI, not to micromanage every byte. `chrono`
was removed from the crate's dependencies during this work since it was unused and only
added to compile time / binary size.

## Memory management

Two wasm-bindgen classes own linear-memory allocations and must be freed explicitly:

- **`MoodBuffer`** — a growable buffer of mood scores, for local aggregation
  (e.g. a running average) without copying a whole history into JS objects.
- **`StellarTxBytes`** — decoded XDR transaction envelope bytes.

Both:

- expose `.free()` and `[Symbol.dispose]()` (usable with `using buf = new MoodBuffer()`
  in an environment that supports explicit resource management — Node 20+, or
  TypeScript/Babel's `using` downlevel transform elsewhere),
- are additionally registered with a `FinalizationRegistry` by wasm-bindgen itself as a
  GC-triggered backstop — but GC timing isn't deterministic, so don't rely on it under
  memory pressure or in a tight loop; call `.free()` explicitly,
- throw a catchable JS `Error` ("null pointer passed to rust") on double-free or
  use-after-free, rather than corrupting wasm memory — verified in
  [`test/wasm.test.ts`](./test/wasm.test.ts).

All plain functions (`hashPublicKey`, `verifyMoodScore`, `encodeMemo`, etc.) return
owned JS values (`String`, `bool`, `Uint8Array` copies) with no manual cleanup needed —
wasm-bindgen frees the Rust-side temporary as part of the call.

`test/wasm.test.ts`'s "memory management" block runs 5,000 alloc/push/free cycles of
each buffer type as a coarse regression guard: it's not a precise leak detector, but a
real leak (a forgotten `.free()` in a code path under test) would be very likely to
surface as unbounded wasm memory growth over that many iterations.

## Tests

```sh
npm run test -w packages/js/wasm            # Node target (wasm-node/)
npm run test:browser -w packages/js/wasm    # headless Chromium via Playwright (wasm-web/)
npm run test:bun -w packages/js/wasm        # Bun, native test runner
npm run test:deno -w packages/js/wasm       # Deno, via npm:vitest
```

The same spec (`test/wasm.test.ts`) runs against **both** built targets — against
`dist/` + `wasm-node/` under Node, and against `dist/` + `wasm-web/` in a real headless
browser — to catch target-specific bugs (e.g. the `web` target's async fetch-based
`init()` vs. the `nodejs` target's synchronous instantiation) that a single-target
suite would miss. Run `npm run build:wasm && npm run build` first; both configs test
the compiled package, not raw `src/`.

The browser suite needs Chromium installed once: `npx playwright install chromium`
(add `--with-deps` on a fresh Linux CI image without a browser sandbox already set up).

`test:bun` and `test:deno` run the exact same `test/wasm.test.ts` spec unmodified —
see "Runtime compatibility" below for what that verifies and why each is invoked the
way it is.

## Runtime compatibility

Verified in CI (`.github/workflows/rust-ci.yml`'s `wasm-build` job) on every push/PR,
against the built `dist/` + `wasm-node/` (CJS, synchronous instantiation) artifacts —
the ones a server-side/edge consumer actually gets via the `"node"` export condition
in `package.json#imports`'s `"#wasm-binding"` map:

| Runtime | Verified version | How |
|---|---|---|
| Node.js | 20+ | `npm run test` (Vitest, `node` environment) |
| Bun | 1.3+ | `npm run test:bun` — Bun's own Jest/Vitest-compatible test runner, which runs `test/wasm.test.ts` **unmodified** (no `vitest` process spawn — see below) |
| Deno | 2.x | `npm run test:deno` — Vitest itself, running *under* Deno via its `npm:` specifier and Node-compat layer, also against the unmodified spec |

Both were confirmed working with **no changes needed to `src/` or the compiled wasm
output** — the `"node"` package.json export condition, `fs.readFileSync`-based sync
wasm instantiation, and `FinalizationRegistry`/`Symbol.dispose` memory management all
behave identically to Node under both runtimes.

Two invocation details, not package bugs, worth knowing if you're wiring this up
yourself:

- **Bun**: `bun run vitest` (spawning Vitest's own CLI under Bun) does **not** work —
  Vitest's worker-pool RPC layer (`tinypool`, over `worker_threads`/`child_process`)
  hits gaps in Bun's Node-compat implementation (`MessagePort.addListener`,
  `ChildProcess.channel.unref` are both missing as of Bun 1.3). Bun's own test runner
  (`bun test`) sidesteps this entirely — it doesn't shell out to Vitest, it recognizes
  `describe`/`it`/`expect` imported from `'vitest'` and runs them with its native
  implementation directly in-process. Use `bun test`, not `bun run vitest`.
- **Deno**: consuming the package itself only needs `--allow-read` (the CJS binding
  calls `fs.readFileSync` on the `.wasm` file — verified with no other permission
  flags). Running the **test suite** needs the full `-A` (all permissions) — not
  because of anything in this package, but because Vitest's underlying Vite/esbuild
  toolchain needs `--allow-run` (to spawn esbuild's native binary), `--allow-write`
  (Vite's bundled-config temp file), `--allow-net` (Vite's HMR server, started even in
  test mode), and `--allow-ffi`/`--allow-sys` (native Rollup binary, `os.cpus()`). A
  real integrator consuming the published package directly (not running this repo's
  dev toolchain) does not need `-A`.

Not covered here: the `web` wasm-pack target (`wasm-web/`, fetch-based `init()`) is
exercised by `test:browser` via Playwright/Chromium regardless of host OS/runtime —
Deno and Bun compatibility for *that* target isn't meaningful the same way, since a
browser's own JS engine runs it, not Deno's or Bun's.

## Publishing

See [`.github/workflows/wasm-publish.yml`](../../../.github/workflows/wasm-publish.yml) —
triggered by pushing a `wasm-v*` tag or manually via `workflow_dispatch`. It rebuilds
both targets from source, runs both test suites, and publishes with npm provenance.

## Examples

- [`examples/vanilla-js/index.html`](../../../examples/vanilla-js/index.html)
- [`examples/react-app/src/App.tsx`](../../../examples/react-app/src/App.tsx) (`WasmInsights`)
