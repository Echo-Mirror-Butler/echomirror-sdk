import type { CacheConfig } from './types'

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * Simple TTL-based cache with automatic expiry.
 *
 * The cache is owned by the client instance that creates it, so two
 * `GlobalFeedClient` or `LeaderboardClient` instances sharing the same
 * `EchoMirrorClient` will each have their own cache. This means cache
 * invalidation on one instance does not affect another.
 */
export class TtlCache<T> {
  private _store = new Map<string, CacheEntry<T>>()
  private _ttl: number

  constructor(config?: CacheConfig) {
    this._ttl = config?.ttl ?? 30_000
  }

  /**
   * Get a cached value. Returns `undefined` if the key doesn't exist or
   * the entry has expired (lazy eviction).
   */
  get(key: string): T | undefined {
    const entry = this._store.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiresAt) {
      this._store.delete(key)
      return undefined
    }

    return entry.data
  }

  /**
   * Set a cached value with the configured TTL.
   */
  set(key: string, data: T): void {
    this._store.set(key, {
      data,
      expiresAt: Date.now() + this._ttl,
    })
  }

  /**
   * Check if a key exists and is still valid.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  /**
   * Remove a single key from the cache.
   */
  invalidate(key: string): void {
    this._store.delete(key)
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this._store.clear()
  }
}