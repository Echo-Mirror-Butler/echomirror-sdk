import { describe, expect, it } from 'vitest'
import { fromStroops, increaseByBps, normalizeAmount, reduceByBps, toStroops } from '../src/amounts'
import { TransactionMalformedError } from '../src/errors'

describe('amounts', () => {
  it('round-trips decimal amounts without float drift', () => {
    expect(normalizeAmount('12.5')).toBe('12.5')
    expect(normalizeAmount('0.0000001')).toBe('0.0000001')
    expect(normalizeAmount(3)).toBe('3')
    expect(normalizeAmount('922337203685.4775807')).toBe('922337203685.4775807')
  })

  it('parses to stroops exactly', () => {
    expect(toStroops('1')).toBe(10_000_000n)
    expect(toStroops('0.1')).toBe(1_000_000n)
    expect(fromStroops(15_000_000n)).toBe('1.5')
  })

  it.each(['0', '-1', '1.12345678', 'abc', '1e5', ''])('rejects invalid amount %j', (bad) => {
    expect(() => toStroops(bad)).toThrow(TransactionMalformedError)
  })

  it('applies slippage in basis points exactly', () => {
    expect(reduceByBps('100', 50)).toBe('99.5')
    expect(increaseByBps('100', 50)).toBe('100.5')
    expect(reduceByBps('0.0000010', 50)).toBe('0.0000009') // floors, never rounds up a minimum
  })
})
