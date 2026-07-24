import { assertReady, raw } from './load.js'
import { toWasmError } from './errors.js'

/**
 * Check whether a mood score (1–10) is valid — matches the range enforced
 * server-side and by `@echomirror/core`'s `MoodScore` type.
 */
export function verifyMoodScore(score: number): boolean {
  assertReady('verifyMoodScore')
  return raw.verify_mood_score(score)
}

/**
 * A growable buffer of mood scores held in wasm linear memory, for
 * client-side aggregation (e.g. computing a running average across a long
 * local history) without shipping the whole history to JS heap objects.
 *
 * Owns a wasm-side allocation — call `.free()` (or use it with `using`,
 * which calls `[Symbol.dispose]` automatically) when done. wasm-bindgen
 * also registers a `FinalizationRegistry` as a GC-triggered backstop, but
 * GC timing isn't deterministic, so don't rely on it under memory pressure
 * or in tight loops — free explicitly.
 *
 * @example
 * using buffer = new MoodBuffer()
 * buffer.push(7)
 * buffer.push(9)
 * console.log(buffer.average()) // 8
 * // freed automatically at the end of this scope
 */
export class MoodBuffer implements Disposable {
  #inner: raw.MoodBuffer

  constructor() {
    assertReady('MoodBuffer')
    this.#inner = new raw.MoodBuffer()
  }

  /** Append a score. Throws if outside the valid 1–10 range. */
  push(score: number): void {
    try {
      this.#inner.push(score)
    } catch (err) {
      throw toWasmError(err)
    }
  }

  get length(): number {
    return this.#inner.len()
  }

  get isEmpty(): boolean {
    return this.#inner.is_empty()
  }

  average(): number {
    return this.#inner.average()
  }

  /** Copy the buffer out as a `Uint8Array`, independent of this instance. */
  toBytes(): Uint8Array {
    return this.#inner.to_bytes()
  }

  /** Release the wasm-side allocation. Safe to call more than once. */
  free(): void {
    this.#inner.free()
  }

  [Symbol.dispose](): void {
    this.free()
  }
}
