import { describe, it, expect } from 'vitest'
import { Analytics } from '../src/analytics'
import { MemoryStorage } from '../src/storage'
import type { AnalyticsEvent, Transport } from '../src/types'

function idFactory(prefix: string): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

describe('offline persistence', () => {
  it('survives a reload and flushes each buffered event exactly once', async () => {
    const storage = new MemoryStorage()

    const beforeReload = new Analytics({
      storage,
      autoFlush: false,
      generateId: idFactory('a'),
    })
    await beforeReload.track('feed_viewed', { entryCount: 1 })
    await beforeReload.track('feed_viewed', { entryCount: 2 })
    await beforeReload.track('feed_viewed', { entryCount: 3 })
    expect(beforeReload.pending()).toHaveLength(3)

    const sent: AnalyticsEvent[] = []
    const transport: Transport = async (batch) => {
      sent.push(...batch)
    }
    const afterReload = new Analytics({
      storage,
      transport,
      autoFlush: false,
      generateId: idFactory('b'),
    })
    expect(afterReload.pending()).toHaveLength(3)

    await afterReload.flush()
    await afterReload.flush()

    const ids = sent.map((event) => event.messageId)
    expect(sent).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    expect(afterReload.pending()).toHaveLength(0)
  })

  it('retains events for retry when the transport fails', async () => {
    const storage = new MemoryStorage()
    let attempts = 0
    const transport: Transport = async () => {
      attempts += 1
      throw new Error('network down')
    }
    const analytics = new Analytics({
      storage,
      transport,
      autoFlush: false,
      generateId: idFactory('c'),
    })

    await analytics.track('feed_viewed', { entryCount: 1 })
    await expect(analytics.flush()).rejects.toThrow('network down')
    expect(attempts).toBe(1)
    expect(analytics.pending()).toHaveLength(1)
  })
})
