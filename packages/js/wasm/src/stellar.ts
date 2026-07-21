import { assertReady, raw } from './load.js'
import { toWasmError } from './errors.js'

/** SHA-256 hash of a Stellar public key, as lowercase hex — never store the raw key. */
export function hashPublicKey(publicKey: string): string {
  assertReady('hashPublicKey')
  return raw.hash_public_key(publicKey)
}

/**
 * Format check only (starts with 'G', 56 chars, alphanumeric) — does not
 * verify the key exists on-chain.
 */
export function isValidStellarAddress(address: string): boolean {
  assertReady('isValidStellarAddress')
  return raw.is_valid_stellar_address(address)
}

/** Base64-encode a string for use in an XDR memo field (28 bytes max). */
export function encodeMemo(text: string): string {
  assertReady('encodeMemo')
  try {
    return raw.encode_memo(text)
  } catch (err) {
    throw toWasmError(err)
  }
}

/**
 * Raw Stellar transaction envelope bytes, decoded from a base64 XDR string
 * and held in wasm linear memory.
 *
 * Owns a wasm-side allocation — call `.free()` (or use it with `using`)
 * when done. See `MoodBuffer` in `./mood.ts` for the same ownership
 * contract and the FinalizationRegistry caveat.
 *
 * @example
 * using tx = new StellarTxBytes(signedXdr)
 * const hash = tx.sha256()
 */
export class StellarTxBytes implements Disposable {
  #inner: raw.StellarTxBytes

  constructor(xdrBase64: string) {
    assertReady('StellarTxBytes')
    try {
      this.#inner = new raw.StellarTxBytes(xdrBase64)
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

  /** SHA-256 hash of the raw envelope bytes, as lowercase hex. */
  sha256(): string {
    return this.#inner.sha256()
  }

  /** Copy the raw bytes out as a `Uint8Array`, independent of this instance. */
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
