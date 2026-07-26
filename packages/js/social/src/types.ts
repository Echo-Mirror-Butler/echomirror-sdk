import type { GlobalFeedEntry, LeaderboardEntry } from '@echomirror/core'

/**
 * Time window for leaderboard queries.
 */
export type LeaderboardWindow = 'daily' | 'weekly' | 'all-time'

/**
 * Options for fetching the global feed.
 */
export interface FeedFetchOptions {
  /** Cursor for cursor-based pagination (infinite-scroll-friendly). */
  cursor?: string
  /** Number of entries per page. Defaults to 20. */
  limit?: number
}

/**
 * Response shape for a paginated feed fetch.
 */
export interface FeedResponse {
  entries: GlobalFeedEntry[]
  /** Pass this as `cursor` in the next request. `null` means no more pages. */
  nextCursor: string | null
}

/**
 * Options for fetching the leaderboard.
 */
export interface LeaderboardFetchOptions {
  /** Time window. Defaults to 'weekly'. */
  window?: LeaderboardWindow
}

/**
 * Social-specific events emitted by the real-time subscription.
 */
export type SocialLiveEvent =
  | { type: 'feed:new_entry'; entry: GlobalFeedEntry }
  | { type: 'leaderboard:updated'; window: LeaderboardWindow; entries: LeaderboardEntry[] }

/**
 * Configuration for the cache layer.
 */
export interface CacheConfig {
  /** Time-to-live in milliseconds. Defaults to 30_000 (30s). */
  ttl?: number
}