import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsClient, MemoryStorage } from '../src'
import type { AnalyticsBatch } from '../src'

function testIds(): () => string {
  let id = 0
  return () => String(++id)
}

describe('AnalyticsClient batching', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes on the time and size thresholds', async () => {
    const batches: AnalyticsBatch[] = []
    const client = new AnalyticsClient({
      transport: async (batch) => {
        batches.push(batch)
      },
      storage: new MemoryStorage(),
      batchSize: 2,
      flushIntervalMs: 1_000,
      generateId: testIds(),
    })

    client.trackWalletConnected({ network: 'testnet' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(batches).toHaveLength(1)
    expect(batches[0].events).toHaveLength(1)

    client.trackGiftSent({ amount: 5, asset: 'ECHO' })
    client.trackStreakMilestoneReached({ milestone: 7, currentStreak: 7 })
    await client.flush()
    expect(batches).toHaveLength(2)
    expect(batches[1].events.map((event) => event.name)).toEqual([
      'gift_sent',
      'streak_milestone_reached',
    ])
    client.stop()
  })

  it('keeps a failed batch queued for retry', async () => {
    const transport = vi
      .fn<(batch: AnalyticsBatch) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const client = new AnalyticsClient({
      transport,
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
    })

    client.trackAIReflectionViewed({ sentiment: 'positive' })
    await expect(client.flush()).rejects.toThrow('offline')
    expect(client.getPendingEvents()).toHaveLength(1)

    await client.flush()
    expect(client.getPendingEvents()).toHaveLength(0)
    expect(transport.mock.calls[0][0].events[0].id).toBe(
      transport.mock.calls[1][0].events[0].id,
    )
  })
})

describe('AnalyticsClient persistence and identity', () => {
  it('survives a simulated reload without loss or duplication', async () => {
    const storage = new MemoryStorage()
    const ids = testIds()
    const firstClient = new AnalyticsClient({
      transport: async () => undefined,
      storage,
      flushIntervalMs: 0,
      generateId: ids,
    })
    const original = firstClient.trackMoodLogged({ score: 7 })
    firstClient.stop()

    const delivered: AnalyticsBatch[] = []
    const reloadedClient = new AnalyticsClient({
      transport: async (batch) => {
        delivered.push(batch)
      },
      storage,
      flushIntervalMs: 0,
      generateId: ids,
    })
    expect(reloadedClient.getPendingEvents().map((event) => event.id)).toEqual([original.id])
    await reloadedClient.flush()

    const secondReload = new AnalyticsClient({
      transport: async (batch) => {
        delivered.push(batch)
      },
      storage,
      flushIntervalMs: 0,
      generateId: ids,
    })
    await secondReload.flush()
    expect(delivered.flatMap((batch) => batch.events).map((event) => event.id)).toEqual([
      original.id,
    ])
  })

  it('stitches pre-login anonymous events to the authenticated user', async () => {
    const batches: AnalyticsBatch[] = []
    const client = new AnalyticsClient({
      transport: async (batch) => {
        batches.push(batch)
      },
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
      generateId: testIds(),
    })
    const anonymousId = client.getIdentity().anonymousId
    client.trackMoodLogged({ score: 8 })

    client.identify('user-42')
    await client.flush()

    const events = batches.flatMap((batch) => batch.events)
    const moodEvent = events.find((event) => event.name === 'mood_logged')
    expect(moodEvent).toMatchObject({ anonymousId, userId: 'user-42' })
    expect(events.find((event) => event.name === 'identity_stitched')).toMatchObject({
      anonymousId,
      userId: 'user-42',
      properties: { previousAnonymousId: anonymousId },
    })
  })
})

describe('AnalyticsClient privacy', () => {
  it('never emits mood note, tag text, or nested PII in default mode', async () => {
    const batches: AnalyticsBatch[] = []
    const storage = new MemoryStorage()
    const client = new AnalyticsClient({
      transport: async (batch) => {
        batches.push(batch)
      },
      storage,
      flushIntervalMs: 0,
      generateId: testIds(),
    })

    const event = client.track('mood_logged', {
      score: 4,
      note: 'private note: therapy appointment',
      tags: ['family-secret', 'medical-secret'],
      source: 'manual',
    })
    client.track('custom_profile_event', {
      action: 'opened',
      profile: {
        email: 'private@example.com',
        displayName: 'Private Person',
      },
    })
    const persistedBeforeFlush = storage.getItem('echomirror.analytics.v1') ?? ''
    expect(persistedBeforeFlush).not.toContain('therapy appointment')
    expect(persistedBeforeFlush).not.toContain('family-secret')
    expect(persistedBeforeFlush).not.toContain('private@example.com')
    await client.flush()

    expect(event.properties).toEqual({
      score: 4,
      source: 'manual',
      moodCategory: 'low',
      hasNote: true,
      tagCount: 2,
    })
    const serialized = JSON.stringify(batches)
    expect(serialized).not.toContain('therapy appointment')
    expect(serialized).not.toContain('family-secret')
    expect(serialized).not.toContain('medical-secret')
    expect(serialized).not.toContain('private@example.com')
    expect(serialized).not.toContain('Private Person')
  })

  it('only includes rich mood properties after explicit opt-in', () => {
    const client = new AnalyticsClient({
      transport: async () => undefined,
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
      privacy: { allowSensitiveProperties: true },
    })

    const event = client.trackMoodLogged({
      score: 9,
      note: 'I want to share this',
      tags: ['grateful'],
    })
    expect(event.properties).toMatchObject({
      note: 'I want to share this',
      tags: ['grateful'],
    })
  })
})
