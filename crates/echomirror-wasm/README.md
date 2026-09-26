# echomirror-wasm

[![crates.io](https://img.shields.io/crates/v/echomirror-wasm?color=ce422b&style=flat-square)](https://crates.io/crates/echomirror-wasm)

The WebAssembly build of the
[EchoMirror SDK](https://github.com/Echo-Mirror-Butler/echomirror-sdk) — the
hot-path crypto and sync primitives compiled to WASM so they run in a browser
or in Node.js without shipping a native binary.

> **Rust users should usually use [`echomirror-core`](../echomirror-core) or
> [`echomirror-sync`](../echomirror-sync) instead.** This crate targets
> `wasm32-unknown-unknown`; it is published to crates.io so the build is
> reproducible and auditable from source, not as the recommended server-side
> dependency.
>
> **JavaScript users should install [`@echomirror/wasm`](https://www.npmjs.com/package/@echomirror/wasm)**
> from npm. That package ships the prebuilt `wasm-web` and `wasm-node`
> artifacts; you do not need to build this crate yourself.

## What's in it

- SHA-256 and the digest helpers the sync engine needs for cursor
  serialization and content addressing
- Stellar XDR encode/decode primitives
- Cursor (de)serialization shared with `echomirror-sync`
- Feature-detected WASM SIMD128 fast paths, with a scalar fallback
- An explicit memory model (the WASM module owns its buffer; the JS wrapper
  copies out and frees in), so long-lived browser sessions don't grow

## Features

| Feature | Default | Effect |
| --- | --- | --- |
| `console_error_panic_hook` | yes | Routes Rust panics to `console.error` instead of a silent trap |
| `simd` | no | Enables WASM SIMD128 intrinsics (set automatically by the wasm-pack build) |
| `bench-helpers` | no | Exposes non-wasm32 test-data generators used by `benches/` |

## Building

The npm package is produced by wasm-pack, which is what the build script drives:

```bash
npm run build:wasm -w packages/js/wasm   # wasm-pack build, web + nodejs targets
npm run build -w packages/js/wasm        # compile the TS wrapper
```

Two artifacts are built and published: a scalar build (always loaded) and a
SIMD build (loaded only when `WebAssembly.validate` reports SIMD support). See
[`packages/js/wasm/README.md`](https://github.com/Echo-Mirror-Butler/echomirror-sdk/blob/main/packages/js/wasm/README.md)
for the runtime-compatibility matrix (Node, Bun, Deno, browsers) and bundle
size budgets.

## Notes

- MSRV: 1.85.
- No `docs.rs` build target is configured: this crate's API is only meaningful
  under `wasm32-unknown-unknown`, which docs.rs does not target. Read the
  source, or the TypeScript wrapper's docs, instead.

## License

MIT — see the repository [LICENSE](https://github.com/Echo-Mirror-Butler/echomirror-sdk/blob/main/LICENSE).
