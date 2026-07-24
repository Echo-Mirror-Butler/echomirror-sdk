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
