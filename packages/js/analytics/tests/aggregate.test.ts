import { describe, expect, it } from 'vitest'
import { aggregateMood, aggregateMoodThisWeek } from '../src'

describe('mood aggregation', () => {
  const entries = [
    { score: 4, tags: ['work', 'tired'], timestamp: '2026-07-20T10:00:00Z' },
    { score: 8, tags: ['work', 'grateful'], timestamp: '2026-07-22T10:00:00Z' },
    { score: 10, tags: ['holiday'], timestamp: '2026-07-12T10:00:00Z' },
  ]

  it('calculates average mood and common tags for a range', () => {
    expect(
      aggregateMood(entries, {
        from: '2026-07-20T00:00:00Z',
        to: '2026-07-26T23:59:59Z',
      }),
    ).toEqual({
      averageScore: 6,
      entryCount: 2,
      mostCommonTags: [
        { tag: 'work', count: 2 },
        { tag: 'grateful', count: 1 },
        { tag: 'tired', count: 1 },
      ],
      from: '2026-07-20T00:00:00.000Z',
      to: '2026-07-26T23:59:59.000Z',
    })
  })

  it('uses the current UTC week for the dashboard helper', () => {
    const rollup = aggregateMoodThisWeek(entries, '2026-07-23T12:00:00Z')
    expect(rollup.averageScore).toBe(6)
    expect(rollup.from).toBe('2026-07-20T00:00:00.000Z')
  })
})
