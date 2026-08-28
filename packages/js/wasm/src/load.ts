// Resolves to the correct wasm-bindgen binding based on:
//   1. Whether we are in Node (import condition "node") or browser ("browser").
//   2. Whether the runtime supports WASM SIMD128 (probed once, then cached).
//
// The four build artifacts produced by scripts/build.mjs are:
//   wasm-web/          browser, scalar  (always available — the safe fallback)
//   wasm-node/         Node,    scalar
//   wasm-web-simd/     browser, SIMD128 (loaded only when detectSimd() → true)
//   wasm-node-simd/    Node,    SIMD128
//
// The scalar import is resolved at module evaluation time via the
// "#wasm-binding" entry in package.json#imports (keyed on "node"/"browser").
// The SIMD import cannot go through that same static import map entry because
// we need to choose it at runtime — so it is loaded via a dynamic
// import('#wasm-binding-simd') which package.json maps to the right directory.
//
// Typing note
// ───────────
// Consumer modules (mood.ts, stellar.ts, sync.ts) use `raw.MoodBuffer` and
// `raw.StellarTxBytes` both as *value constructors* (new raw.MoodBuffer()) and
// as *type names* (#inner: raw.MoodBuffer). TypeScript resolves these from the
// static `#wasm-binding` namespace declaration — so `raw` must keep the type
// `typeof scalarRaw` (the namespace). At runtime, all property accesses on
// `raw` are forwarded through a Proxy to the currently-resolved binding
// (scalar or SIMD). The two bindings have identical API surfaces, so this is safe.

import * as scalarRaw from '#wasm-binding'
import { detectSimd } from './detect-simd.js'

let _active: typeof scalarRaw = scalarRaw

/**
 * A Proxy that forwards all property accesses to the currently-resolved
 * binding. Exported as `raw` so consumers get the correct namespace type
 * (typed as `typeof scalarRaw` — the `#wasm-binding` namespace shape) while
 * transparently dispatching to scalar or SIMD at runtime.
 *
 * Class constructors used in consumer modules (new raw.MoodBuffer(), etc.)
 * go through `get` → the constructor function is retrieved from `_active`,
 * then called with `new` by the consumer — no special `construct` trap needed.
 */
export const raw: typeof scalarRaw = new Proxy(scalarRaw, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_active as any)[prop]
  },
})

let readyPromise: Promise<void> | null = null

/**
 * Instantiate the wasm module. Required once, before any other call, when
 * running in a browser (fetches and compiles the .wasm asset). A no-op in
 * Node, where the module is already instantiated synchronously — safe to
 * call unconditionally either way, and safe to call more than once.
 *
 * When SIMD128 is supported by the runtime, the SIMD build is loaded
 * automatically instead of the scalar build. You do not need to do anything
 * different — the switch is transparent.
 *
 * @example
 * import { init, verifyMoodScore } from '@echomirror/wasm'
 * await init()
 * verifyMoodScore(7)
 */
export function init(): Promise<void> {
  if (readyPromise) return readyPromise

  readyPromise = (async () => {
    // Attempt to load the SIMD build when the runtime supports it. We try
    // the dynamic import first and fall back to scalar on any error —
    // including "module not found" (SIMD artifacts not built yet) and
    // "instantiation failed" (runtime lied about SIMD support, rare but
    // theoretically possible in some embedded runtimes).
    if (detectSimd()) {
      try {
        const simdBinding = (await import('#wasm-binding-simd')) as typeof scalarRaw
        _active = simdBinding
        // Web target: the default export is the async init function.
        const maybeInit = (simdBinding as { default?: unknown }).default
        if (typeof maybeInit === 'function') {
          await (maybeInit as () => Promise<unknown>)()
        }
        return
      } catch {
        // SIMD build unavailable or instantiation failed — fall through to
        // scalar. This is an expected code-path when WASM_BUILD_DEV=1 was
        // used (SIMD artifacts not produced) or in any environment where
        // WebAssembly.validate returned a false positive.
      }
    }

    // Scalar path (always available).
    _active = scalarRaw
    const maybeInit = (scalarRaw as { default?: unknown }).default
    if (typeof maybeInit === 'function') {
      await (maybeInit as () => Promise<unknown>)()
    }
  })()

  return readyPromise
}

/** True once `init()` has resolved. Wrapped calls throw a clear error before that. */
export function isReady(): boolean {
  return readyPromise !== null
}

export function assertReady(fnName: string): void {
  if (readyPromise === null) {
    throw new WasmNotInitializedError(fnName)
  }
}

export class WasmNotInitializedError extends Error {
  constructor(fnName: string) {
    super(`@echomirror/wasm: call init() before using ${fnName}()`)
    this.name = 'WasmNotInitializedError'
  }
}
