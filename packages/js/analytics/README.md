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

## Local dashboard aggregation and Differential Privacy

Raw tags and mood metrics can be aggregated locally without entering the outbound event queue. Output aggregates use **Differential Privacy (DP)** noise injection and small-cohort suppression to prevent statistical re-identification:

```ts
import { aggregateMood, aggregateMoodThisWeek } from '@echomirror/analytics'

// Aggregation with default privacy protection (epsilon = 1.0, minCohortSize = 5)
const rollup = aggregateMoodThisWeek(moodEntries)
// { averageScore, entryCount, mostCommonTags, from, to }

// Customizing privacy budget and cohort threshold
const customRollup = aggregateMood(moodEntries, {
  from: '2026-07-20T00:00:00Z',
  to: '2026-07-26T23:59:59Z',
  privacy: {
    epsilon: 1.0,        // Privacy budget (default: 1.0)
    minCohortSize: 5,    // Suppression threshold (default: 5)
  },
})

// Opt-out for internal raw diagnostics:
const rawRollup = aggregateMood(moodEntries, {
  from: '2026-07-20T00:00:00Z',
  to: '2026-07-26T23:59:59Z',
  raw: true,
})
```

### Understanding Epsilon ($\varepsilon$) and Privacy Budget

Differential privacy injects mathematically calibrated zero-mean Laplace noise into aggregate counts and average mood scores. The privacy budget parameter **epsilon ($\varepsilon$)** controls the privacy-vs-utility tradeoff:

- **Lower $\varepsilon$ (e.g. 0.1 – 0.5)**: Stronger privacy guarantee. More random noise is injected into the output. Best for public reporting or small cohorts.
- **$\varepsilon = 1.0$ (Default)**: Balanced privacy and utility. Standard conservative default suitable for user-facing dashboards and aggregated team metrics.
- **Higher $\varepsilon$ (e.g. 2.0 – 5.0)**: Weaker privacy guarantee, higher precision. Lower noise added to results. Suitable only for high-volume internal operational statistics.

### Small Cohort Suppression

Noise injection alone cannot reliably prevent membership inference on tiny cohorts (e.g. groups of 1–3 users). To eliminate this risk, `aggregateMood` enforces a **minimum cohort size** (`minCohortSize`, default: `5`).

If the number of matching records in the requested time window is less than `minCohortSize`, the aggregate output is suppressed:
- `averageScore: null`
- `entryCount: null`
- `mostCommonTags: []`
- `suppressed: true`

### Privacy Model Guarantees and Limits

- **What this protects**: Guarantees that an observer analyzing the aggregate outputs (`averageScore`, `entryCount`, tag frequencies) cannot determine with high statistical confidence whether any single user's data was included or excluded in the aggregation, protecting against linkage and differencing attacks.
- **What this does NOT protect**: Differential privacy applies strictly to the output of `aggregateMood` / `aggregateMoodThisWeek`. It provides no protection for upstream data storage, raw logs, or backend data pipelines that ingest and retain individual events prior to aggregation.

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

