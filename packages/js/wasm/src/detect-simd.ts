/**
 * Runtime WASM SIMD128 feature detection.
 *
 * Uses `WebAssembly.validate` to probe whether the current runtime supports
 * the WASM SIMD128 proposal. The probe is a minimal, hand-crafted WASM
 * binary that contains a single `i32x4.splat` SIMD instruction — just
 * enough to trigger a reject in runtimes without SIMD support without
 * actually instantiating anything.
 *
 * ## Why this matters
 *
 * The SIMD build (`wasm-web-simd/`, `wasm-node-simd/`) uses
 * `target-feature=+simd128` and wasm-opt's `--enable-simd` pass to produce
 * a binary with v128 SIMD instructions. Runtimes that do not support the
 * SIMD proposal will refuse to instantiate such a module. We therefore
 * detect support at runtime and fall back to the scalar build transparently.
 *
 * ## SIMD support matrix (as of 2026)
 *
 * | Runtime                | SIMD support since         |
 * |------------------------|----------------------------|
 * | Chrome / Edge          | 91 (May 2021)              |
 * | Firefox                | 89 (June 2021)             |
 * | Safari                 | 16.4 (March 2023)          |
 * | Node.js (V8)           | 16.4.0 (May 2021)          |
 * | Deno                   | 1.9 (April 2021)           |
 * | WasmEdge / Wasmtime    | supported                  |
 * | Older browsers / embedded runtimes | not supported |
 *
 * `engines.node` in package.json requires Node ≥ 18, which means V8's SIMD
 * support is guaranteed on the Node side. Browser support is wide but not
 * universal — mobile browsers on older devices and some non-Chromium browsers
 * (pre-16.4 Safari) lack it, so the fallback path remains necessary.
 *
 * @see https://webassembly.org/features/ (SIMD entry)
 * @see https://caniuse.com/wasm-simd
 */

/**
 * Minimal WASM module (11 bytes) that contains a single v128 SIMD instruction
 * (`i32x4.splat` / opcode 0xFD 0x0F). `WebAssembly.validate` accepts this
 * only if the runtime supports the SIMD proposal. The magic, version, and
 * type/function/code sections are the absolute minimum required for a valid
 * module structure.
 *
 * Binary layout:
 *   \0asm  version=1  type-section(1 entry: () -> ())
 *   function-section  code-section(i32.const 0, i32x4.splat, drop, end)
 *
 * This is the same probe used by wasm-feature-detect and binaryen's own test
 * suite — it is a well-established, stable way to detect SIMD support.
 */
const SIMD_PROBE = new Uint8Array([
  // WASM magic + version
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  // type section: 1 type, () -> ()
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
  // function section: 1 function of type 0
  0x03, 0x02, 0x01, 0x00,
  // code section: 1 function body
  0x0a, 0x0a, 0x01, 0x08, 0x00,
  //   i32.const 0
  0x41, 0x00,
  //   i32x4.splat  (0xFD prefix + LEB128 opcode 0x0f)
  0xfd, 0x0f,
  //   drop
  0x1a,
  //   end
  0x0b,
])

let _cached: boolean | undefined

/**
 * Returns `true` if the current runtime supports WASM SIMD128.
 *
 * The result is cached after the first call — subsequent calls are
 * synchronous and allocation-free. Safe to call before `init()`.
 *
 * @example
 * if (detectSimd()) {
 *   // load SIMD build
 * } else {
 *   // load scalar fallback
 * }
 */
export function detectSimd(): boolean {
  if (_cached !== undefined) return _cached
  try {
    _cached = WebAssembly.validate(SIMD_PROBE)
  } catch {
    // WebAssembly is not available at all (very old browser, headless env
    // without WASM support). Treat as no-SIMD so we fall back to scalar.
    _cached = false
  }
  return _cached
}

/**
 * Reset the cached detection result. Used in tests only.
 * @internal
 */
export function _resetSimdCache(): void {
  _cached = undefined
}
