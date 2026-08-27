import { describe, expect, it } from 'vitest'
import { AnalyticsClient, MemoryStorage, aggregateMood } from '../src'

function testIds(): () => string {
  let id = 0
  return () => String(++id)
}

describe('AnalyticsClient purge', () => {
  it('removes all events matching a userId from the queue', () => {
    const storage = new MemoryStorage()
    const client = new AnalyticsClient({
      transport: async () => undefined,
      storage,
      flushIntervalMs: 0,
      generateId: testIds(),
    })

    client.trackMoodLogged({ score: 7 })
    client.identify('user-abc')
    client.trackMoodLogged({ score: 8 })
    client.trackMoodLogged({ score: 9 })

    const result = client.purgeUser('user-abc')

    expect(result.purged).toBe(true)
    expect(result.eventsRemoved).toBe(3) // mood_logged(7) was stamped with userId via identify, plus the two after identify
    expect(result.audit.eventsRemoved).toBe(3)
    expect(result.audit.userHash).toMatch(/^hash_/)
    expect(result.audit.purgedAt).toBeTruthy()

    // The queue should now only contain the purge audit's own events (none — purge removes from queue)
    const remaining = client.getPendingEvents()
    expect(remaining.every((e) => e.userId !== 'user-abc')).toBe(true)
  })

  it('removes all events matching an anonymousId', () => {
    const storage = new MemoryStorage()
    const client = new AnalyticsClient({
      transport: async () => undefined,
      storage,
      flushIntervalMs: 0,
      generateId: testIds(),
    })

    const { anonymousId } = client.getIdentity()
    client.trackMoodLogged({ score: 5 })
    client.trackMoodLogged({ score: 6 })

    const result = client.purgeUser(anonymousId)

    expect(result.purged).toBe(true)
    expect(result.eventsRemoved).toBe(2)
    expect(client.getPendingEvents()).toHaveLength(0)
  })

  it('purging one user does not affect events from other users', () => {
    const storage = new MemoryStorage()
    const client = new AnalyticsClient({
      transport: async () => undefined,
      storage,
      flushIntervalMs: 0,
      generateId: testIds(),
    })

    // User A events
    client.trackMoodLogged({ score: 3 })
    client.identify('user-a')
    client.trackMoodLogged({ score: 4 })

    // User B events
    client.identify('user-b')
    client.trackMoodLogged({ score: 8 })
    client.trackMoodLogged({ score: 9 })

    const result = client.purgeUser('user-a')

    expect(result.eventsRemoved).toBe(2)
    const remaining = client.getPendingEvents()
    expect(remaining).toHaveLength(2)
    expect(remaining.every((e) => e.userId === 'user-b')).toBe(true)
  })

  it('returns purged: false when no matching events exist', () => {
    const client = new AnalyticsClient({
      transport: async () => undefined,
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
    })

    const result = client.purgeUser('nonexistent-user')
    expect(result.purged).toBe(false)
    expect(result.eventsRemoved).toBe(0)
  })

  it('writes an audit record without PII', () => {
    const storage = new MemoryStorage()
    const client = new AnalyticsClient({
      transport: async () => undefined,
      storage,
      flushIntervalMs: 0,
    })

    client.trackMoodLogged({ score: 5 })
    client.purgeUser('sensitive@example.com')

    const log = client.getPurgeAuditLog()
    expect(log).toHaveLength(1)
    expect(log[0].purgedAt).toBeTruthy()
    expect(log[0].eventsRemoved).toBe(1)
    expect(log[0].userHash).toMatch(/^hash_/)

    // The raw email must NOT appear anywhere in storage
    const raw = JSON.stringify(Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [i, storage.getItem(String(i))]).filter(([, v]) => v !== null)
    ))
    // Check all storage keys
    const allStorage = JSON.stringify(storage)
    expect(allStorage).not.toContain('sensitive@example.com')
  })

  it('audit log accumulates across multiple purges', () => {
    const client = new AnalyticsClient({
      transport: async () => undefined,
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
    })

    client.purgeUser('user-1')
    client.purgeUser('user-2')
    client.purgeUser('user-3')

    const log = client.getPurgeAuditLog()
    expect(log).toHaveLength(3)
    // Each should have a distinct userHash
    const hashes = log.map((r) => r.userHash)
    expect(new Set(hashes).size).toBe(3)
  })

  it('throws on empty identifier', () => {
    const client = new AnalyticsClient({
      transport: async () => undefined,
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
    })

    expect(() => client.purgeUser('')).toThrow('non-empty string')
    expect(() => client.purgeUser('   ')).toThrow('non-empty string')
  })

  it('purge survives persistence round-trip', () => {
    const storage = new MemoryStorage()
    const ids = testIds()

    // Create client, add events, purge
    const firstClient = new AnalyticsClient({
      transport: async () => undefined,
      storage,
      flushIntervalMs: 0,
      generateId: ids,
    })
    firstClient.trackMoodLogged({ score: 1 })
    firstClient.identify('user-purge')
    firstClient.trackMoodLogged({ score: 2 })
    firstClient.purgeUser('user-purge')
    firstClient.stop()

    // Reload — the purged events should stay gone
    const reloaded = new AnalyticsClient({
      transport: async () => undefined,
      storage,
      flushIntervalMs: 0,
      generateId: ids,
    })

    expect(reloaded.getPendingEvents()).toHaveLength(0)
    const log = reloaded.getPurgeAuditLog()
    expect(log).toHaveLength(1)
    expect(log[0].eventsRemoved).toBe(2)
  })

  it('computed aggregates are not modified by purge (documented behavior)', () => {
    const client = new AnalyticsClient({
      transport: async () => undefined,
      storage: new MemoryStorage(),
      flushIntervalMs: 0,
    })

    // Simulate entries that were used to compute an aggregate BEFORE purge
    const entries = [
      { score: 4, timestamp: '2026-07-20T10:00:00Z' },
      { score: 8, timestamp: '2026-07-22T10:00:00Z' },
    ]

    // Purge doesn't touch the entries array — aggregates are caller-owned
    client.purgeUser('user-from-entries')

    // The pre-computed aggregate is still valid for its original data set
    // (This test documents that purge does NOT retroactively fix aggregates.)
    const rollup = aggregateMood(entries, {
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-31T23:59:59Z',
    })
    expect(rollup.entryCount).toBe(2)
    expect(rollup.averageScore).toBe(6)
  })
})
