// Ambient contract for the raw wasm-bindgen output, shared by both build
// targets. The real implementation is resolved at runtime via the
// "#wasm-binding" entry in package.json#imports ("node" -> wasm-node/*.cjs,
// "browser"/"default" -> wasm-web/*.js) — this declaration exists purely so
// TypeScript can type-check src/*.ts against a stable shape regardless of
// which physical build artifact backs the import at the consumer's
// resolution time. It intentionally mirrors the generated
// wasm-web/echomirror_wasm.d.ts / wasm-node/echomirror_wasm.d.ts files;
// regenerate this by hand if the Rust crate's public API changes.
declare module '#wasm-binding' {
  /** Raw wasm-bindgen mood score buffer. Must be `.free()`d — see src/mood.ts. */
  export class MoodBuffer {
    free(): void
    [Symbol.dispose](): void
    constructor()
    push(score: number): void
    len(): number
    is_empty(): boolean
    average(): number
    to_bytes(): Uint8Array
  }

  /** Raw wasm-bindgen Stellar XDR byte buffer. Must be `.free()`d — see src/stellar.ts. */
  export class StellarTxBytes {
    free(): void
    [Symbol.dispose](): void
    constructor(xdrBase64: string)
    len(): number
    is_empty(): boolean
    sha256(): string
    to_bytes(): Uint8Array
  }

  export function verify_mood_score(score: number): boolean
  export function hash_public_key(publicKey: string): string
  export function is_valid_stellar_address(address: string): boolean
  export function encode_memo(text: string): string
  export function serialize_cursor(
    ledgerSequence: number,
    pagingToken: string,
    totalProcessed: number,
  ): string
  export function parse_cursor_paging_token(cursorJson: string): string | undefined

  /**
   * Instantiate the wasm module. Present (and required) on the `web` target;
   * absent on the `nodejs` target, which instantiates synchronously at
   * require-time instead. See src/load.ts.
   */
  const init: ((input?: unknown) => Promise<unknown>) | undefined
  export default init
}
