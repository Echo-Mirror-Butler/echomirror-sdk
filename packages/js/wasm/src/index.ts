/*!
 * @echomirror/wasm — EchoMirror SDK compiled to WebAssembly.
 *
 * High-performance crypto, XDR byte handling, and sync-cursor helpers that
 * run directly in the browser or Node.js, with no server round-trip. This
 * is a hand-written ergonomic wrapper over the raw wasm-bindgen output —
 * see src/load.ts for how the two build targets (browser ESM vs Node CJS)
 * are resolved under the hood.
 *
 * @example
 * import { init, verifyMoodScore, hashPublicKey, MoodBuffer } from '@echomirror/wasm'
 * await init()
 *
 * const valid = verifyMoodScore(7)
 * const hash = hashPublicKey('GPUBLIC...')
 *
 * using buffer = new MoodBuffer()
 * buffer.push(7)
 * buffer.push(9)
 * buffer.average() // 8
 */

export { init, isReady, WasmNotInitializedError } from './load.js'
export { WasmError } from './errors.js'

export { verifyMoodScore, MoodBuffer } from './mood.js'
export { hashPublicKey, isValidStellarAddress, encodeMemo, StellarTxBytes } from './stellar.js'
export { serializeCursor, parseCursorPagingToken } from './sync.js'
export type { SyncCursor } from './sync.js'
