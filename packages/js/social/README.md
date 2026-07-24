# @echomirror/social

EchoMirror SDK social module — global feed, leaderboard, and real-time updates.

## Installation

```bash
npm install @echomirror/social
```

Requires `@echomirror/core` as a dependency. React hooks require `react >= 18` (optional peer).

## Usage

### Global Feed (paginated, infinite-scroll friendly)

```ts
import { GlobalFeedClient } from '@echomirror/social'
import { EchoMirrorClient } from '@echomirror/core'

const client = new EchoMirrorClient({ apiKey: 'your_api_key' })
const feed = new GlobalFeedClient(client)

// First page
const { entries, nextCursor } = await feed.fetchFeed()
// Next page
const page2 = await feed.fetchFeed({ cursor: nextCursor })
```

### Leaderboard (time-windowed)

```ts
import { LeaderboardClient } from '@echomirror/social'

const leaderboard = new LeaderboardClient(client)
const weekly = await leaderboard.fetchLeaderboard()
const daily = await leaderboard.fetchLeaderboard({ window: 'daily' })
```

### React hooks

```tsx
import { useGlobalFeed, useLeaderboard } from '@echomirror/social'
import { useEchoMirrorClient } from '@echomirror/react'

function GlobalFeed() {
  const client = useEchoMirrorClient()
  const { entries, isLoading, fetchMore, hasMore, refresh } = useGlobalFeed(client)

  return (
    <div>
      {entries.map(e => <p key={e.id}>{e.score}/10</p>)}
      {hasMore && <button onClick={fetchMore}>Load more</button>}
    </div>
  )
}

function LeaderboardView() {
  const client = useEchoMirrorClient()
  const { entries, isLoading } = useLeaderboard(client, 'weekly')

  return <div>{entries.map(e => <p key={e.userId}>#{e.rank} {e.displayName}</p>)}</div>
}
```

### Real-time subscriptions

```ts
import { SocialSubscription } from '@echomirror/social'

const sub = new SocialSubscription()
const unsubscribe = sub.subscribe((event) => {
  if (event.type === 'feed:new_entry') {
    console.log('New feed entry:', event.entry)
  }
})
// Cleanup
unsubscribe()
```

## API

| Export | Description |
|--------|-------------|
| `GlobalFeedClient` | Paginated feed fetch with cursor API and client-side caching |
| `LeaderboardClient` | Time-windowed leaderboard with short-TTL cache |
| `SocialSubscription` | Real-time event subscription with reconnect |
| `WebSocketTransport` | Default WebSocket transport for `SocialSubscription` |
| `RealtimeTransport` | Interface for swapping transport (e.g. SSE) |
| `TtlCache` | Generic TTL-based cache used internally |
| `useGlobalFeed()` | React hook for feed state (`entries`, `isLoading`, `fetchMore`, `refresh`, `hasMore`) |
| `useLeaderboard()` | React hook for leaderboard state (`entries`, `isLoading`, `refresh`) |

## Open Questions / Assumptions

The following aspects were **not discoverable** from the available code or documentation and are **assumed** until the backend contract is confirmed:

| Assumption | Details |
|------------|---------|
| **Feed endpoint** | `GET /social/feed?cursor=...&limit=...` — assumed to return `{ entries, nextCursor }` |
| **Leaderboard endpoint** | `GET /social/leaderboard?window=daily|weekly|all-time` — assumed to return `LeaderboardEntry[]` |
| **Tie-break rules** | Inferred order: `weeklyScore` desc → `totalEntries` asc → `streak` desc (see `leaderboard.ts` for the inline ASSUMPTION comment) |
| **Real-time protocol** | Assumed WebSocket at `wss://api.echomirror.dev/v1/social/ws`. The `RealtimeTransport` interface is designed so SSE (or any other transport) can be swapped in with a single-line change |
| **Cache TTL** | Feed: 30s. Leaderboard: 15s. Configurable via `CacheConfig`. |

Once the backend is reachable, these assumptions should be verified against actual API responses.