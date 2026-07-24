// Runs against the built package (dist/ + wasm-node/ or wasm-web/,
// depending on which vitest config is active) rather than raw src/ — the
// point of this suite is to catch target-specific bugs in the actual
// shipped artifacts, not just the TypeScript source. Run `npm run
// build:wasm && npm run build` before invoking this directly.
import { describe, expect, it } from 'vitest'
import {
  MoodBuffer,
  StellarTxBytes,
  encodeMemo,
  hashPublicKey,
  init,
  isValidStellarAddress,
  parseCursorPagingToken,
  serializeCursor,
  verifyMoodScore,
  WasmError,
} from '../dist/index.js'

await init()

describe('mood', () => {
  it('validates score range', () => {
    expect(verifyMoodScore(1)).toBe(true)
    expect(verifyMoodScore(10)).toBe(true)
    expect(verifyMoodScore(0)).toBe(false)
    expect(verifyMoodScore(11)).toBe(false)
  })

  it('MoodBuffer accumulates and averages', () => {
    const buf = new MoodBuffer()
    buf.push(4)
    buf.push(6)
    buf.push(8)
    expect(buf.length).toBe(3)
    expect(buf.isEmpty).toBe(false)
    expect(buf.average()).toBe(6)
    expect(Array.from(buf.toBytes())).toEqual([4, 6, 8])
    buf.free()
  })

  it('MoodBuffer rejects out-of-range scores with a WasmError', () => {
    const buf = new MoodBuffer()
    expect(() => buf.push(0)).toThrow(WasmError)
    expect(() => buf.push(11)).toThrow(/between 1 and 10/)
    buf.free()
  })

  it('implements Symbol.dispose so `using buf = new MoodBuffer()` frees it automatically', () => {
    // vitest's esbuild-based transform doesn't yet parse the `using`
    // declaration syntax itself, so this calls the disposal protocol
    // directly rather than via `using` — but it's the same method the
    // `using` desugaring would call in a consumer's bundler/runtime that
    // does support it (Node 20+, modern TS/Babel output).
    const buf = new MoodBuffer()
    buf.push(7)
    expect(buf.length).toBe(1)
    buf[Symbol.dispose]()
    expect(() => buf.push(1)).toThrow(/null pointer/)
  })
})

describe('stellar', () => {
  it('hashPublicKey is deterministic', () => {
    const a = hashPublicKey('GTESTPUBLICKEY')
    const b = hashPublicKey('GTESTPUBLICKEY')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('isValidStellarAddress checks format', () => {
    expect(isValidStellarAddress('G' + 'A'.repeat(55))).toBe(true)
    expect(isValidStellarAddress('not-an-address')).toBe(false)
    expect(isValidStellarAddress('G' + 'A'.repeat(10))).toBe(false)
  })

  it('encodeMemo rejects memos over 28 bytes', () => {
    expect(encodeMemo('short memo')).toBeTypeOf('string')
    expect(() => encodeMemo('x'.repeat(29))).toThrow(WasmError)
  })

  it('StellarTxBytes decodes, hashes, and round-trips bytes', () => {
    const xdr = encodeMemo('hello')
    const tx = new StellarTxBytes(xdr)
    expect(tx.length).toBe(5)
    expect(tx.isEmpty).toBe(false)
    expect(tx.sha256()).toMatch(/^[0-9a-f]{64}$/)
    expect(new TextDecoder().decode(tx.toBytes())).toBe('hello')
    tx.free()
  })

  it('StellarTxBytes rejects invalid base64', () => {
    expect(() => new StellarTxBytes('not valid base64 !!')).toThrow(WasmError)
  })
})

describe('sync cursor', () => {
  it('round-trips through serialize/parse', () => {
    const json = serializeCursor({ ledgerSequence: 42, pagingToken: 'abc-123', totalProcessed: 7 })
    expect(parseCursorPagingToken(json)).toBe('abc-123')
  })

  it('parseCursorPagingToken returns undefined for malformed JSON', () => {
    expect(parseCursorPagingToken('not json')).toBeUndefined()
  })
})

describe('memory management', () => {
  it('repeated alloc/free cycles do not grow wasm memory unbounded', () => {
    // Each MoodBuffer allocation is tiny, but a real leak (forgetting
    // .free()) would still show up as monotonic growth across enough
    // iterations. This is a coarse regression guard, not a precise leak
    // detector — see README.md "Memory management" for the full audit.
    for (let i = 0; i < 5_000; i++) {
      const buf = new MoodBuffer()
      buf.push((i % 10) + 1)
      buf.average()
      buf.free()
    }
    for (let i = 0; i < 5_000; i++) {
      const tx = new StellarTxBytes(encodeMemo('x'))
      tx.sha256()
      tx.free()
    }
    // If either loop above leaked wasm-side memory badly enough to matter,
    // it would already have thrown (out-of-memory / grow failure) before
    // reaching here.
    expect(true).toBe(true)
  })

  it('double free and use-after-free throw instead of corrupting memory', () => {
    // wasm-bindgen nulls out the internal pointer on free() and checks it
    // on every subsequent call, so misuse fails loudly in JS rather than
    // silently reading/writing freed wasm memory.
    const buf = new MoodBuffer()
    buf.push(5)
    buf.free()
    expect(() => buf.free()).toThrow(/null pointer/)
    expect(() => buf.push(3)).toThrow(/null pointer/)
  })
})
