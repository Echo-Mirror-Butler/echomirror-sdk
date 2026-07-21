// Resolves to wasm-node/*.cjs under the "node" import condition and
// wasm-web/*.js under "browser" (see package.json#imports / "#wasm-binding").
// The nodejs target instantiates its wasm module synchronously at require
// time; the web target needs an explicit async `init()` call to fetch and
// instantiate it — `raw.default` only exists (as a function) on the web
// target, so we use its presence to decide whether there's anything to wait
// on.
import * as raw from '#wasm-binding'

let readyPromise: Promise<void> | null = null

/**
 * Instantiate the wasm module. Required once, before any other call, when
 * running in a browser (fetches and compiles the .wasm asset). A no-op in
 * Node, where the module is already instantiated synchronously — safe to
 * call unconditionally either way, and safe to call more than once.
 *
 * @example
 * import { init, verifyMoodScore } from '@echomirror/wasm'
 * await init()
 * verifyMoodScore(7)
 */
export function init(): Promise<void> {
  if (readyPromise) return readyPromise

  const maybeInit = (raw as { default?: unknown }).default
  readyPromise =
    typeof maybeInit === 'function'
      ? Promise.resolve((maybeInit as () => unknown)()).then(() => undefined)
      : Promise.resolve()

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

export { raw }
