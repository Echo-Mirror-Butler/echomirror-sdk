import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EchoMirrorClient, MoodEntry } from '@echomirror/core'

// Replace the real network call with a controllable spy.
const logMood = vi.fn()
vi.mock('@echomirror/mood', () => ({
  logMood: (client: EchoMirrorClient, payload: unknown) => logMood(client, payload),
}))

import { createMoodWidget } from './machine'
import type { MoodWidgetController } from './machine'
import { createMockClient } from '../test/mockClient'

function baseEntry(over: Partial<MoodEntry> = {}): MoodEntry {
  return {
    id: 'real-1',
    userId: 'u1',
    score: 7,
    note: undefined,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  }
}

describe('createMoodWidget — core state machine', () => {
  beforeEach(() => {
    logMood.mockReset()
  })

  it('starts in idle with no score and cannot submit when a score is required', () => {
    const w = createMoodWidget({ client: createMockClient() })
    const s = w.getSnapshot()
    expect(s.status).toBe('idle')
    expect(s.score).toBeNull()
    expect(s.canSubmit).toBe(false)
    expect(s.missingScore).toBe(true)
  })

  it('allows submit without a score when requireScore is false', () => {
    const w = createMoodWidget({ client: createMockClient(), requireScore: false })
    expect(w.getSnapshot().canSubmit).toBe(true)
  })

  it('clamps and stores the score', () => {
    const w = createMoodWidget({ client: createMockClient() })
    w.setScore(42 as never)
    expect(w.getSnapshot().score).toBe(10)
    w.setScore(0 as never)
    expect(w.getSnapshot().score).toBe(1)
  })

  it('updates note and toggles tags', () => {
    const w = createMoodWidget({ client: createMockClient() })
    w.setNote('feeling okay')
    w.toggleTag('work')
    w.toggleTag('work')
    const s = w.getSnapshot()
    expect(s.note).toBe('feeling okay')
    expect(s.tags).toEqual([])
    w.toggleTag('sleep')
    expect(w.getSnapshot().tags).toEqual(['sleep'])
  })

  it('notifies subscribers on every mutation', () => {
    const w = createMoodWidget({ client: createMockClient() })
    const seen: string[] = []
    const unsub = w.subscribe((s) => seen.push(s.status))
    // subscribe fires immediately with the current snapshot
    expect(seen).toEqual(['idle'])
    w.setScore(5)
    expect(seen).toContain('idle')
    const countAfterMutate = seen.length
    unsub()
    w.setScore(6)
    // no further notifications after unsubscribe
    expect(seen.length).toBe(countAfterMutate)
  })

  it('submits optimistically: success before the server confirms, then confirmed', async () => {
    logMood.mockResolvedValue(baseEntry({ id: 'real-1', score: 8 }))
    const onSubmit = vi.fn()
    const w = createMoodWidget({ client: createMockClient(), onSubmit })
    w.setScore(8)

    const promise = w.submit()
    // optimistic: success immediately, entry present, not yet confirmed
    const optimistic = w.getSnapshot()
    expect(optimistic.status).toBe('success')
    expect(optimistic.confirmed).toBe(false)
    expect(optimistic.entry?.id.startsWith('optimistic-')).toBe(true)

    const result = await promise
    const final = w.getSnapshot()
    expect(final.status).toBe('success')
    expect(final.confirmed).toBe(true)
    expect(final.entry?.id).toBe('real-1')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(result?.id).toBe('real-1')
  })

  it('rolls back to error on failure in optimistic mode and keeps input for retry', async () => {
    logMood.mockRejectedValue(new Error('network down'))
    const onError = vi.fn()
    const w = createMoodWidget({
      client: createMockClient(),
      onError,
      initialScore: 4,
      initialNote: 'hi',
    })

    const result = await w.submit()
    const s = w.getSnapshot()
    expect(result).toBeNull()
    expect(s.status).toBe('error')
    expect(s.error).toBe('network down')
    expect(s.entry).toBeNull()
    expect(s.score).toBe(4) // input preserved
    expect(onError).toHaveBeenCalledTimes(1)

    // retry succeeds
    logMood.mockResolvedValue(baseEntry({ id: 'real-2', score: 4 }))
    const retried = await w.retry()
    expect(w.getSnapshot().status).toBe('success')
    expect(retried?.id).toBe('real-2')
  })

  it('non-optimistic mode stays submitting until resolved', async () => {
    let resolve!: (v: MoodEntry) => void
    logMood.mockImplementation(
      () => new Promise<MoodEntry>((r) => (resolve = r)),
    )
    const w = createMoodWidget({
      client: createMockClient(),
      optimistic: false,
      initialScore: 9,
    })
    const promise = w.submit()
    expect(w.getSnapshot().status).toBe('submitting')
    resolve(baseEntry({ id: 'x', score: 9 }))
    await promise
    expect(w.getSnapshot().status).toBe('success')
    expect(w.getSnapshot().confirmed).toBe(true)
  })

  it('blocks submit when no score is chosen (requireScore)', async () => {
    logMood.mockResolvedValue(baseEntry())
    const w = createMoodWidget({ client: createMockClient() })
    const r = await w.submit()
    expect(r).toBeNull()
    expect(w.getSnapshot().status).toBe('error')
    expect(w.getSnapshot().missingScore).toBe(true)
  })

  it('reset returns to the initial idle state', async () => {
    logMood.mockResolvedValue(baseEntry({ id: 'r', score: 6 }))
    const w: MoodWidgetController = createMoodWidget({
      client: createMockClient(),
      initialScore: 6,
    })
    await w.submit()
    expect(w.getSnapshot().status).toBe('success')
    w.reset()
    const s = w.getSnapshot()
    expect(s.status).toBe('idle')
    expect(s.entry).toBeNull()
    expect(s.score).toBe(6)
  })
})
