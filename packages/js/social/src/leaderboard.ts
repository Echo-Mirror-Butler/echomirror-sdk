import type { EchoMirrorClient } from '@echomirror/core'
import type { LeaderboardEntry } from '@echomirror/core'
import type { LeaderboardWindow, LeaderboardFetchOptions, CacheConfig } from './types'
import { TtlCache } from './cache'

/**
 * Client for fetching the leaderboard with time-windowed queries and
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
   * Fetch the leaderboard for a given time window.
   *
   * Results are cached with a short TTL (default 15s).
   *
   * @example
   * const daily = await leaderboard.fetchLeaderboard({ window: 'daily' })
   * const weekly = await leaderboard.fetchLeaderboard()
   * const allTime = await leaderboard.fetchLeaderboard({ window: 'all-time' })
   */
  async fetchLeaderboard(options?: LeaderboardFetchOptions): Promise<LeaderboardEntry[]> {
    const window = options?.window ?? 'weekly'
    const cacheKey = window

    const cached = this._cache.get(cacheKey)
    if (cached) return cached

    const params = new URLSearchParams()
    params.set('window', window)

    /*
     * ╔══════════════════════════════════════════════════════════════════╗
     * ║  ASSUMPTION — NOT CONFIRMED                                    ║
     * ║                                                                  ║
     * ║  The tie-break rules below are INFEARED from the types in       ║
     * ║  @echomirror/core and common leaderboard patterns. The actual   ║
     * ║  EchoMirror backend may sort differently.                       ║
     * ║                                                                  ║
     * ║  Assumed order (descending):                                    ║
     * ║    1. weeklyScore (higher = better)                             ║
     * ║    2. totalEntries (lower when tied)                            ║
     * ║    3. streak (higher when still tied)                           ║
     * ║                                                                  ║
     * ║  Once the backend is confirmed, either the server-order will    ║
     * ║  match or this client-side sort can be removed entirely.        ║
     * ╚══════════════════════════════════════════════════════════════════╝
     */
    const entries = await this._client.request<LeaderboardEntry[]>(
      'GET',
      `${this._basePath}?${params}`,
    )

    // Apply inferred tie-break sort (backup in case server doesn't order perfectly)
    const sorted = [...entries].sort((a, b) => {
      if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore
      if (a.totalEntries !== b.totalEntries) return a.totalEntries - b.totalEntries
      return b.streak - a.streak
    })

    // Re-assign ranks based on sorted order
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

export type { LeaderboardEntry, LeaderboardWindow, LeaderboardFetchOptions }