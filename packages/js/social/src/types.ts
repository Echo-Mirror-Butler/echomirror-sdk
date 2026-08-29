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
  /** Number of entries to request. Defaults to 10. */
  limit?: number
}

/**
 * Social-specific events emitted by the real-time subscription.
 *
 * `connection:gap` fires after a reconnect when the client cannot guarantee
 * it received every event that occurred while disconnected: either no
 * `feedClient` was configured for backfill, or the backfill request itself
 * failed. `since` is the id of the last `feed:new_entry` this client
 * processed before the disconnect, or `null` if it never received one.
 * Consumers should treat this as "state may be stale" (e.g. prompt a
 * refresh) rather than silently rendering as if nothing happened.
 */
export type SocialLiveEvent =
  | { type: 'feed:new_entry'; entry: GlobalFeedEntry }
  | { type: 'leaderboard:updated'; window: LeaderboardWindow; entries: LeaderboardEntry[] }
  | { type: 'connection:gap'; since: string | null }

/**
 * Configuration for the cache layer.
 */
export interface CacheConfig {
  /** Time-to-live in milliseconds. Defaults to 30_000 (30s). */
  ttl?: number
}
