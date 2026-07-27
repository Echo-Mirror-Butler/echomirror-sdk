# @echomirror/analytics

Privacy-safe emotional UX event tracking, persistent batching, identity stitching, and local mood rollups.

## Installation

```bash
npm install @echomirror/analytics
```

## Track events

```ts
import { AnalyticsClient, createWebhookTransport } from '@echomirror/analytics'

const analytics = new AnalyticsClient({
  transport: createWebhookTransport({ url: '/api/analytics' }),
  batchSize: 20,
  flushIntervalMs: 10_000,
})

analytics.track('mood_logged', {
  score: 8,
  note: 'A private journal entry',
  tags: ['work', 'grateful'],
  source: 'manual',
})
analytics.trackGiftSent({ amount: 5, asset: 'ECHO', recipientType: 'friend' })
```

Built-in event names and properties are typed. Custom names also work through `track(name, properties)`.

By default, the mood event above only queues `score`, `moodCategory`, `hasNote`, `tagCount`, and `source`. Note and tag text are removed before the event is persisted, not just before it is sent. Common PII/content property names are also recursively removed from custom events.

### Sensitive-property opt-in

```ts
const analytics = new AnalyticsClient({
  transport,
  privacy: { allowSensitiveProperties: true },
})
```

This setting sends raw notes, tags, and other sensitive fields. Enable it only after obtaining appropriate consent and reviewing the destination's retention and access controls.

## Offline queue and identity stitching

The browser build uses `localStorage`; non-browser and mobile integrations can provide any synchronous localStorage-compatible `storage`. Events have stable IDs across retries so the destination can deduplicate them.

```ts
analytics.trackMoodLogged({ score: 6 })

// After sign-in, queued events receive this user ID. An identity_stitched event
// also aliases this account to anonymous events that were already delivered.
analytics.identify('account-123')

await analytics.flush()
analytics.stop()
```

The transport must reject on delivery failure. The batch then remains persisted and is retried on the next timed or manual flush.

## Local dashboard aggregation

Raw tags can be aggregated locally without entering the outbound event queue:

```ts
import { aggregateMoodThisWeek } from '@echomirror/analytics'

const rollup = aggregateMoodThisWeek(moodEntries)
// { averageScore, entryCount, mostCommonTags, from, to }
```

## Export shape

Every transport receives vendor-neutral JSON:

```ts
interface AnalyticsBatch {
  schemaVersion: 1
  batchId: string
  sentAt: string
  events: Array<{
    id: string
    name: string
    timestamp: string
    anonymousId: string
    sessionId: string
    userId?: string
    properties: Record<string, JsonValue>
  }>
}
```

Use `createWebhookTransport()` for a plain endpoint, or implement `AnalyticsTransport` to map this shape to PostHog, Mixpanel, or another destination. Deduplicate on each event's stable `id`.
