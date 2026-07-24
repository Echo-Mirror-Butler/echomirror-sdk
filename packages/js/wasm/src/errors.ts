/**
 * Raised when a wasm-side `Result::Err` crosses into JS. wasm-bindgen
 * throws the raw `JsValue` directly (usually a bare string, not an `Error`
 * instance) — this wraps it so callers get a normal `instanceof Error`
 * with a stable `.name` to check against.
 */
export class WasmError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WasmError'
  }
}

export function toWasmError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'string') return new WasmError(err)
  return new WasmError(String(err))
}
