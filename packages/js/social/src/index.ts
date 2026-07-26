// ─── Framework-agnostic core ───────────────────────────────────────────────

export { GlobalFeedClient } from './feed'
export { LeaderboardClient } from './leaderboard'
export { WebSocketTransport, SocialSubscription } from './realtime'
export { TtlCache } from './cache'

// ─── Types ──────────────────────────────────────────────────────────────────

export type {
  GlobalFeedEntry,
  LeaderboardEntry,
} from '@echomirror/core'
export type {
  LeaderboardWindow,
  LeaderboardFetchOptions,
  FeedFetchOptions,
  FeedResponse,
  SocialLiveEvent,
  CacheConfig,
} from './types'
export type {
  RealtimeTransport,
} from './realtime'

// ─── React hooks (optional peer dependency) ────────────────────────────────

// React hooks are in a separate file so bundlers can tree-shake them
// when the consumer doesn't use React.
export { useGlobalFeed, useLeaderboard } from './react'