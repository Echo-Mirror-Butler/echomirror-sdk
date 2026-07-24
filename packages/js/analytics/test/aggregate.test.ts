import { describe, it, expect } from 'vitest'
import {
  averageMoodScore,
  mostCommonTags,
  eventCounts,
  activeDays,
} from '../src/aggregate'
import { toPostHog, toMixpanel } from '../src/adapters'
import { moodLoggedProperties } from '../src/events'
import type { AnalyticsEvent } from '../src/types'

function makeEvent(
  partial: Partial<AnalyticsEvent> & { event: string },
): AnalyticsEvent {
  return {
    messageId: partial.messageId ?? 'm',
    event: partial.event,
    properties: partial.properties ?? {},
    anonymousId: partial.anonymousId ?? 'anon',
    userId: partial.userId ?? null,
    sessionId: partial.sessionId ?? 'sess',
    timestamp: partial.timestamp ?? '2026-07-20T10:00:00.000Z',
  }
}

describe('aggregation helpers', () => {
  it('averages mood scores and respects the time range', () => {
    const events = [
      makeEvent({
        event: 'mood_logged',
        properties: { score: 6 },
        timestamp: '2026-07-18T10:00:00.000Z',
      }),
      makeEvent({
        event: 'mood_logged',
        properties: { score: 8 },
        timestamp: '2026-07-20T10:00:00.000Z',
      }),
      makeEvent({ event: 'feed_viewed', properties: { entryCount: 3 } }),
    ]

    expect(averageMoodScore(events)).toBe(7)
    const since = Date.parse('2026-07-19T00:00:00.000Z')
    expect(averageMoodScore(events, { since })).toBe(8)
    expect(averageMoodScore([])).toBeNull()
  })

  it('ranks the most common tags when tag data is present', () => {
    const events = [
      makeEvent({ event: 'mood_logged', properties: { tags: ['work', 'sleep'] } }),
      makeEvent({ event: 'mood_logged', properties: { tags: ['work'] } }),
    ]
    const top = mostCommonTags(events)
    expect(top[0]).toEqual({ tag: 'work', count: 2 })
  })

  it('counts events by name and distinct active days', () => {
    const events = [
      makeEvent({ event: 'mood_logged', timestamp: '2026-07-20T09:00:00.000Z' }),
      makeEvent({ event: 'mood_logged', timestamp: '2026-07-21T09:00:00.000Z' }),
      makeEvent({ event: 'feed_viewed', timestamp: '2026-07-21T10:00:00.000Z' }),
    ]
    expect(eventCounts(events)).toEqual({ mood_logged: 2, feed_viewed: 1 })
    expect(activeDays(events)).toBe(2)
  })
})

describe('export adapters', () => {
  it('maps to a PostHog payload with a stable distinct id', () => {
    const event = makeEvent({
      event: 'gift_sent',
      properties: { asset: 'ECHO', amount: 5 },
      userId: 'user_1',
    })
    const payload = toPostHog(event)
    expect(payload.event).toBe('gift_sent')
    expect(payload.distinct_id).toBe('user_1')
    expect(payload.properties.$insert_id).toBe('m')
  })

  it('falls back to the anonymous id for Mixpanel when signed out', () => {
    const event = makeEvent({ event: 'feed_viewed', anonymousId: 'anon-x' })
    const payload = toMixpanel(event)
    expect(payload.properties.distinct_id).toBe('anon-x')
  })
})

describe('mood event mapping', () => {
  it('derives a privacy-safe payload from a mood entry', () => {
    const props = moodLoggedProperties({
      score: 9,
      tags: ['work', 'proud'],
      note: 'landed the release',
    })
    expect(props).toEqual({ score: 9, tagCount: 2, hasNote: true })
  })
})
