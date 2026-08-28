import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STORAGE_KEY,
  MemoryStorage,
  purgeEventsByAnonymousId,
  purgeEventsByUserId,
  readState,
} from '../src/storage'

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    name: 'mood_logged',
    timestamp: '2026-08-28T00:00:00.000Z',
    anonymousId: 'anon-1',
    sessionId: 'session-1',
    properties: {},
    ...overrides,
  }
}

describe('analytics storage helpers', () => {
  it('removes values and treats malformed persisted state as absent', () => {
    const storage = new MemoryStorage()
    storage.setItem('temporary', 'value')
    storage.removeItem('temporary')
    expect(storage.getItem('temporary')).toBeNull()

    storage.setItem(DEFAULT_STORAGE_KEY, '{not valid json')
    expect(readState(storage, DEFAULT_STORAGE_KEY)).toBeUndefined()
  })

  it('purges both authenticated and anonymous queued events', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      DEFAULT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        anonymousId: 'anon-1',
        sessionId: 'session-1',
        userId: 'user-1',
        queue: [
          event({ id: 'user-event', userId: 'user-1' }),
          event({ id: 'anonymous-event' }),
          event({ id: 'other-event', anonymousId: 'anon-2', userId: 'user-2' }),
        ],
      }),
    )

    const userResult = purgeEventsByUserId(storage, DEFAULT_STORAGE_KEY, 'user-1')
    expect(userResult.eventsRemoved).toBe(1)
    expect(userResult.state.userId).toBeUndefined()

    const anonymousResult = purgeEventsByAnonymousId(storage, DEFAULT_STORAGE_KEY, 'anon-1')
    expect(anonymousResult.eventsRemoved).toBe(1)
    expect(anonymousResult.state.queue.map((queued) => queued.id)).toEqual(['other-event'])
  })
})
