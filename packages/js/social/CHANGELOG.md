# @echomirror/social

## 0.1.0 — 2026-08-19

### Added

- Initial release of `@echomirror/social`
- `getGlobalFeed(client, options)` — paginated global mood feed
- `getLeaderboard(client, period)` — weekly / monthly / all-time streak leaderboard
- `followUser(client, userId)` / `unfollowUser(client, userId)` — social graph management
- `getFeed(client, options)` — personalised feed from followed users
- Real-time feed updates via `FeedSubscription` (SSE-backed)
- In-memory LRU cache for leaderboard results; configurable TTL
- Optional React helpers (`useFeed`, `useLeaderboard`) — tree-shaken, peer-dep on React
