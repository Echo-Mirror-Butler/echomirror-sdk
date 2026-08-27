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
npm run build:wasm -w packages/js/wasm   # cargo + wasm-pack, both targets + SIMD, wasm-opt
npm run build -w packages/js/wasm        # tsc: compiles src/ -> dist/
```

`build:wasm` produces four directories:

| Directory | Target | Variant |
|---|---|---|
| `wasm-web/` | Browser ESM | Scalar (always available) |
| `wasm-node/` | Node.js CJS | Scalar (always available) |
| `wasm-web-simd/` | Browser ESM | SIMD128 (loaded when supported) |
| `wasm-node-simd/` | Node.js CJS | SIMD128 (loaded when supported) |

Both scalar builds apply `wasm-opt -O4` (via `[package.metadata.wasm-pack.profile.release]`
in the crate's `Cargo.toml`). The SIMD builds additionally use
`RUSTFLAGS="-C target-feature=+simd128"` and a second `wasm-opt --enable-simd -O4`
pass — required so wasm-opt preserves v128 instructions during optimization.

`dist/` (the hand-written wrapper) probes SIMD support at runtime via
`WebAssembly.validate` ([`src/detect-simd.ts`](./src/detect-simd.ts)) and loads
the SIMD build when supported, falling back to scalar automatically. The switch
is transparent — all consumer modules (`stellar.ts`, `mood.ts`, `sync.ts`) import
`raw` from `load.ts` and always get the best available build. See
[`src/load.ts`](./src/load.ts) for the loading logic.

The `"#wasm-binding"` and `"#wasm-binding-simd"` entries in `package.json#imports`
map each variant to the correct web/node artifact.

Run `WASM_BUILD_DEV=1 npm run build:wasm` for a faster, unoptimized `--dev` build
during local iteration (scalar only — SIMD artifacts are skipped).

## SIMD acceleration

WASM SIMD128 is enabled automatically on supporting runtimes (Chrome 91+, Firefox 89+,
Safari 16.4+, Node ≥ 16.4). The SHA-256 and base64 paths are the primary beneficiaries:

| Operation | Speedup |
|---|---|
| `hashPublicKey` / `StellarTxBytes.sha256` | **1.5×** |
| XDR base64 encode/decode (512 B) | **1.35×** |
| `verifyMoodScore`, `MoodBuffer.average` | no change (not data-parallel) |

See [`BENCHMARKS.md`](./BENCHMARKS.md) for full before/after numbers, methodology,
runtime support matrix, and the reasoning behind the dual-build approach.

## Bundle size

```sh
npm run size -w packages/js/wasm
```

Measured `.wasm` output after wasm-opt -O4 (both web and node targets are
byte-identical — same crate, same optimization pass, only the JS glue differs):

| Build | `.wasm` raw | gzipped |
|---|---|---|
| Scalar (`wasm-web/`, `wasm-node/`) | 60.6 KB | ~26 KB |
| SIMD (`wasm-web-simd/`, `wasm-node-simd/`) | 62.1 KB | ~27 KB |

Both builds are shipped in the npm tarball. Only one is ever instantiated at runtime.
Budgets: 250 KB (scalar) / 260 KB (SIMD), set in [`scripts/report-size.mjs`](./scripts/report-size.mjs).

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
```

The same spec (`test/wasm.test.ts`) runs against **both** built targets — against
`dist/` + `wasm-node/` under Node, and against `dist/` + `wasm-web/` in a real headless
browser — to catch target-specific bugs (e.g. the `web` target's async fetch-based
`init()` vs. the `nodejs` target's synchronous instantiation) that a single-target
suite would miss. Run `npm run build:wasm && npm run build` first; both configs test
the compiled package, not raw `src/`.

The browser suite needs Chromium installed once: `npx playwright install chromium`
(add `--with-deps` on a fresh Linux CI image without a browser sandbox already set up).

## Publishing

See [`.github/workflows/wasm-publish.yml`](../../../.github/workflows/wasm-publish.yml) —
triggered by pushing a `wasm-v*` tag or manually via `workflow_dispatch`. It rebuilds
both targets from source, runs both test suites, and publishes with npm provenance.

## Examples

- [`examples/vanilla-js/index.html`](../../../examples/vanilla-js/index.html)
- [`examples/react-app/src/App.tsx`](../../../examples/react-app/src/App.tsx) (`WasmInsights`)
