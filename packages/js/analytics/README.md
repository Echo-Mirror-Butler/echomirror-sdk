# @echomirror/analytics

Privacy-safe emotional-UX event tracking for the EchoMirror SDK. Buffers events
locally, flushes in batches, survives reloads, stitches anonymous sessions to
real users on sign-in, and exports to any destination (PostHog, Mixpanel, or a
plain webhook) through a vendor-neutral event shape.

## Install

```bash
npm install @echomirror/analytics
```

## Quick start

```ts
import { Analytics } from '@echomirror/analytics'

const analytics = new Analytics({
  endpoint: 'https://example.com/analytics',
})

analytics.track('mood_logged', { score: 8, tagCount: 2, hasNote: true })
analytics.track('gift_sent', { asset: 'ECHO', amount: 5 })

analytics.identify('user_123')
```

First-class domain events (`mood_logged`, `streak_milestone_reached`,
`gift_sent`, `wallet_connected`, `ai_reflection_viewed`, `feed_viewed`,
`leaderboard_viewed`) are typed, so property names and value types autocomplete.
`track(name, properties)` also accepts any custom event name.

## Privacy by default

`privacyMode` defaults to `'strict'`. In strict mode, sensitive property keys —
notably `note` and `tags`, plus other free-text fields — are stripped before an
event is queued, so raw mood content never leaves the client. Only scores,
categorical values, counts, and metadata are sent.

```ts
analytics.track('mood_logged', {
  score: 5,
  note: 'stays on the device',
  tags: ['work'],
})
```

The flushed payload contains `score` only — `note` and `tags` are removed. This
is enforced by tests, not just documentation. To opt into richer tracking, set
`privacyMode: 'full'` and accept the tradeoff explicitly.

Use `moodLoggedProperties(entry)` to derive a safe payload from a `MoodEntry`
(keeps `score`, replaces `note`/`tags` with `hasNote`/`tagCount`).

## Batching, offline queue, and reloads

Events buffer in persistent storage (`localStorage` in the browser, in-memory
otherwise — inject your own via `storage`). They flush when either trigger
fires:

- size: the queue reaches `flushAt` (default 20)
- time: every `flushIntervalMs` (default 30000)

Events are removed from the queue only after a successful transport, so a failed
send keeps them for retry, and a reload before flush loses nothing and sends
nothing twice. A new `Analytics` instance sharing the same storage picks up the
pending queue.

## Anonymous → authenticated stitching

Before sign-in, events carry a persisted anonymous id. Calling
`identify(userId)` backfills the user id onto every already-queued anonymous
event and attaches it to future events, so pre-login history is attributed to
the account rather than dropped.

## Aggregation helpers

```ts
import {
  averageMoodScore,
  mostCommonTags,
  eventCounts,
  activeDays,
} from '@echomirror/analytics'

averageMoodScore(events, { since: Date.parse('2026-07-14') })
mostCommonTags(events)
```

## Export shape and adapters

The canonical event shape is:

```jsonc
{
  "messageId": "…",
  "event": "mood_logged",
  "properties": { "score": 8 },
  "anonymousId": "…",
  "userId": "user_123",
  "sessionId": "…",
  "timestamp": "2026-07-20T10:00:00.000Z"
}
```

Pipe it anywhere:

```ts
import { toPostHog, toMixpanel, webhookTransport } from '@echomirror/analytics'

const analytics = new Analytics({
  transport: webhookTransport('https://example.com/ingest'),
})

posthog.capture(toPostHog(event))
mixpanel.track(payload.event, toMixpanel(event).properties)
```

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `endpoint` | — | Webhook URL used when no `transport` is given |
| `transport` | no-op | `(batch) => Promise<void>` send function |
| `storage` | `localStorage` or memory | Persistence backend |
| `privacyMode` | `'strict'` | `'strict'` strips sensitive keys; `'full'` keeps them |
| `flushAt` | `20` | Size-based flush threshold |
| `flushIntervalMs` | `30000` | Time-based flush interval |
| `autoFlush` | `true` | Start the interval timer on construction |
| `storageKey` | `echomirror.analytics` | Storage namespace |

## License

MIT
