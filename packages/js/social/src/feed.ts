import type { EchoMirrorClient } from '@echomirror/core'
import type { GlobalFeedEntry } from '@echomirror/core'
import type { FeedFetchOptions, FeedResponse, CacheConfig } from './types'
import { TtlCache } from './cache'

/**
 * Client for fetching the global feed with cursor-based pagination and
 * client-side caching (prevents refetch on repeated mounts).
 *
 * Cache behavior: each `GlobalFeedClient` instance owns its own `TtlCache`.
 * Two hooks using the same client share a cache; two hooks with different
 * clients get separate caches.
 */
export class GlobalFeedClient {
  private _client: EchoMirrorClient
  private _cache: TtlCache<FeedResponse>
  private _basePath: string

  constructor(
    client: EchoMirrorClient,
    options?: { basePath?: string; cache?: CacheConfig },
  ) {
    this._client = client
    this._cache = new TtlCache<FeedResponse>(options?.cache)
    this._basePath = options?.basePath ?? '/social/feed'
  }

  /**
   * Fetch a page of the global feed.
   *
   * Pass the `nextCursor` from the previous response to get the next page.
   * Results are cached by cursor so repeated mounts with the same cursor
   * don't trigger a network request.
   *
   * @example
   * const { entries, nextCursor } = await feed.fetchFeed()
   * const { entries: page2 } = await feed.fetchFeed({ cursor: nextCursor })
   */
  async fetchFeed(options?: FeedFetchOptions): Promise<FeedResponse> {
    const cursor = options?.cursor
    const limit = options?.limit ?? 20
    const cacheKey = cursor ?? '__initial__'

    const cached = this._cache.get(cacheKey)
    if (cached) return cached

    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (cursor) params.set('cursor', cursor)

    const response = await this._client.request<FeedResponse>(
      'GET',
      `${this._basePath}?${params}`,
    )

    this._cache.set(cacheKey, response)
    return response
  }

  /**
   * Fetch every feed entry newer than `sinceId`, oldest-first.
   *
   * Used by {@link SocialSubscription} to backfill entries missed while a
   * real-time connection was down. Bypasses the cache: this is always meant
   * to return fresh data for a specific gap, not a page a hook would re-render.
   */
  async fetchSince(sinceId: string, options?: { limit?: number }): Promise<FeedResponse> {
    const limit = options?.limit ?? 50
    const params = new URLSearchParams()
    params.set('since_id', sinceId)
    params.set('limit', String(limit))

    return this._client.request<FeedResponse>('GET', `${this._basePath}?${params}`)
  }

  /**
   * Clear all cached feed pages. Useful after a mutation or when the user
   * explicitly requests a refresh.
   */
  clearCache(): void {
    this._cache.clear()
  }
}

export type { GlobalFeedEntry, FeedFetchOptions, FeedResponse }