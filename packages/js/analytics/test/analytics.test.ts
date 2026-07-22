import { describe, it, expect, vi } from 'vitest'
import { Analytics } from '../src/analytics'
import { MemoryStorage } from '../src/storage'
import type { AnalyticsEvent, AnalyticsProperties, Transport } from '../src/types'

function idFactory(): () => string {
  let n = 0
  return () => `msg-${++n}`
}

function collector(): { transport: Transport; sent: AnalyticsEvent[] } {
  const sent: AnalyticsEvent[] = []
  const transport: Transport = async (batch) => {
    sent.push(...batch)
  }
  return { transport, sent }
}

describe('Analytics privacy', () => {
  it('never lets a mood note or tags into a default-mode payload', async () => {
    const { transport, sent } = collector()
    const analytics = new Analytics({
      transport,
      storage: new MemoryStorage(),
      autoFlush: false,
      generateId: idFactory(),
    })

    await analytics.track('mood_logged', { score: 8, tagCount: 2, hasNote: true })

    const leaky: AnalyticsProperties = {
      score: 5,
      note: 'should never leave the client',
      tags: ['work', 'stress'],
    }
    await analytics.track('mood_logged', leaky)
    await analytics.flush()

    expect(sent).toHaveLength(2)
    for (const event of sent) {
      expect(event.properties.note).toBeUndefined()
      expect(event.properties.tags).toBeUndefined()
    }
    expect(sent[0].properties.score).toBe(8)
    expect(sent[1].properties.score).toBe(5)
  })

  it('keeps rich properties when full mode is explicitly opted into', async () => {
    const { transport, sent } = collector()
    const analytics = new Analytics({
      transport,
      storage: new MemoryStorage(),
      autoFlush: false,
      privacyMode: 'full',
      generateId: idFactory(),
    })

    const rich: AnalyticsProperties = { score: 5, note: 'kept on purpose' }
    await analytics.track('mood_logged', rich)
    await analytics.flush()

    expect(sent[0].properties.note).toBe('kept on purpose')
  })
})

describe('Analytics batching', () => {
  it('flushes when the size threshold is reached', async () => {
    const { transport, sent } = collector()
    const analytics = new Analytics({
      transport,
      storage: new MemoryStorage(),
      autoFlush: false,
      flushAt: 3,
      generateId: idFactory(),
    })

    await analytics.track('feed_viewed', { entryCount: 1 })
    await analytics.track('feed_viewed', { entryCount: 2 })
    expect(sent).toHaveLength(0)

    await analytics.track('feed_viewed', { entryCount: 3 })
    expect(sent).toHaveLength(3)
    expect(analytics.pending()).toHaveLength(0)
  })

  it('flushes on the interval timer', async () => {
    vi.useFakeTimers()
    try {
      const { transport, sent } = collector()
      const analytics = new Analytics({
        transport,
        storage: new MemoryStorage(),
        autoFlush: true,
        flushAt: 100,
        flushIntervalMs: 1000,
        generateId: idFactory(),
      })

      await analytics.track('feed_viewed', { entryCount: 1 })
      expect(sent).toHaveLength(0)

      await vi.advanceTimersByTimeAsync(1000)
      expect(sent).toHaveLength(1)

      analytics.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
