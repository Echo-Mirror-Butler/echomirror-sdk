import { describe, it, expect } from 'vitest'
import { Analytics } from '../src/analytics'
import { MemoryStorage } from '../src/storage'
import type { AnalyticsEvent, Transport } from '../src/types'

function idFactory(): () => string {
  let n = 0
  return () => `id-${++n}`
}

describe('anonymous to authenticated stitching', () => {
  it('attributes pre-login events to the account after identify', async () => {
    const sent: AnalyticsEvent[] = []
    const transport: Transport = async (batch) => {
      sent.push(...batch)
    }
    const analytics = new Analytics({
      storage: new MemoryStorage(),
      transport,
      autoFlush: false,
      generateId: idFactory(),
    })

    const anon = analytics.anonymousId
    await analytics.track('feed_viewed', { entryCount: 1 })
    await analytics.track('mood_logged', { score: 7, tagCount: 0, hasNote: false })
    expect(analytics.userId).toBeNull()

    analytics.identify('user_42')
    await analytics.track('gift_sent', { asset: 'ECHO', amount: 10 })
    await analytics.flush()

    const domainEvents = sent.filter((event) => event.event !== '$identify')
    expect(domainEvents).toHaveLength(3)
    for (const event of domainEvents) {
      expect(event.userId).toBe('user_42')
      expect(event.anonymousId).toBe(anon)
    }
  })

  it('keeps the same anonymous id across a reload until identify', () => {
    const storage = new MemoryStorage()
    const first = new Analytics({ storage, autoFlush: false })
    const anon = first.anonymousId

    const second = new Analytics({ storage, autoFlush: false })
    expect(second.anonymousId).toBe(anon)
  })
})
