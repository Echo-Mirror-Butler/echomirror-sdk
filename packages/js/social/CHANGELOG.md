# @echomirror/social

## 0.1.1

### Patch Changes

- 56fa6a4: Configure Changesets release automation and publishing path to npm.
- Updated dependencies [56fa6a4]
  - @echomirror/core@0.1.1

## Unreleased

### Fixed

- `LeaderboardClient` now sends the canonical `limit` query parameter and unwraps leaderboard responses from `{ entries }` instead of expecting a bare array.

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
