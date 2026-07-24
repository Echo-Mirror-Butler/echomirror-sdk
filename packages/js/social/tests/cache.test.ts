import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TtlCache } from '../src/cache'

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores and retrieves values', () => {
    const cache = new TtlCache<string>({ ttl: 10_000 })
    cache.set('key1', 'value1')
    expect(cache.get('key1')).toBe('value1')
  })

  it('returns undefined for missing keys', () => {
    const cache = new TtlCache<string>({ ttl: 10_000 })
    expect(cache.get('nonexistent')).toBeUndefined()
  })

  it('expires entries after TTL', () => {
    const cache = new TtlCache<string>({ ttl: 5_000 })
    cache.set('key1', 'value1')
    vi.advanceTimersByTime(5_001)
    expect(cache.get('key1')).toBeUndefined()
  })

  it('returns false for has() on expired entries', () => {
    const cache = new TtlCache<string>({ ttl: 1_000 })
    cache.set('key1', 'value1')
    expect(cache.has('key1')).toBe(true)
    vi.advanceTimersByTime(1_001)
    expect(cache.has('key1')).toBe(false)
  })

  it('invalidates a single key', () => {
    const cache = new TtlCache<string>({ ttl: 10_000 })
    cache.set('key1', 'value1')
    cache.set('key2', 'value2')
    cache.invalidate('key1')
    expect(cache.get('key1')).toBeUndefined()
    expect(cache.get('key2')).toBe('value2')
  })

  it('clears all entries', () => {
    const cache = new TtlCache<string>({ ttl: 10_000 })
    cache.set('key1', 'value1')
    cache.set('key2', 'value2')
    cache.clear()
    expect(cache.get('key1')).toBeUndefined()
    expect(cache.get('key2')).toBeUndefined()
  })

  it('uses default TTL when not configured', () => {
    const cache = new TtlCache<string>()
    cache.set('key1', 'value1')
    vi.advanceTimersByTime(30_001)
    expect(cache.get('key1')).toBeUndefined()
  })

  it('overwrites existing keys', () => {
    const cache = new TtlCache<string>({ ttl: 10_000 })
    cache.set('key1', 'old')
    cache.set('key1', 'new')
    expect(cache.get('key1')).toBe('new')
  })
})