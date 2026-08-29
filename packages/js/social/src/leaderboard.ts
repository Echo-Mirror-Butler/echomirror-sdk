import type { EchoMirrorClient } from '@echomirror/core'
import type { LeaderboardEntry } from '@echomirror/core'
import type { LeaderboardFetchOptions, CacheConfig } from './types'
import { TtlCache } from './cache'

interface LeaderboardResponse {
  entries: LeaderboardEntry[]
}

/**
 * Client for fetching the leaderboard with canonical limit-based queries and
 * a short-TTL cache (default 15s so scores feel current).
 *
 * Cache behavior: each `LeaderboardClient` instance owns its own `TtlCache`.
 */
export class LeaderboardClient {
  private _client: EchoMirrorClient
  private _cache: TtlCache<LeaderboardEntry[]>
  private _basePath: string

  constructor(
    client: EchoMirrorClient,
    options?: { basePath?: string; cache?: CacheConfig },
  ) {
    this._client = client
    this._cache = new TtlCache<LeaderboardEntry[]>({ ttl: 15_000, ...options?.cache })
    this._basePath = options?.basePath ?? '/social/leaderboard'
  }

  /**
   * Fetch the leaderboard using the canonical contract shape.
   *
   * Results are cached with a short TTL (default 15s).
   *
   * @example
   * const topTen = await leaderboard.fetchLeaderboard()
   * const topFive = await leaderboard.fetchLeaderboard({ limit: 5 })
   */
  async fetchLeaderboard(options?: LeaderboardFetchOptions): Promise<LeaderboardEntry[]> {
    const limit = options?.limit ?? 10
    const cacheKey = String(limit)

    const cached = this._cache.get(cacheKey)
    if (cached) return cached

    const params = new URLSearchParams()
    params.set('limit', String(limit))

    /*
     * The contract fixture returns `{ entries }` and accepts `limit`. The API
     * does not define a time-window parameter, so the client should preserve
     * backend ordering only after unwrapping the canonical response shape.
     */
    const response = await this._client.request<LeaderboardResponse>(
      'GET',
      `${this._basePath}?${params}`,
    )

    const sorted = [...response.entries].sort((a, b) => {
      if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore
      if (a.totalEntries !== b.totalEntries) return a.totalEntries - b.totalEntries
      return b.streak - a.streak
    })

    const ranked = sorted.map((entry, i) => ({ ...entry, rank: i + 1 }))

    this._cache.set(cacheKey, ranked)
    return ranked
  }

  /**
   * Clear all cached leaderboard data.
   */
  clearCache(): void {
    this._cache.clear()
  }
}

export type { LeaderboardEntry, LeaderboardFetchOptions }
