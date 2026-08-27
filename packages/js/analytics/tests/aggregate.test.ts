import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MIN_COHORT_SIZE,
  aggregateMood,
  aggregateMoodThisWeek,
  sampleLaplaceNoise,
} from '../src'

describe('mood aggregation', () => {
  const entries = [
    { score: 4, tags: ['work', 'tired'], timestamp: '2026-07-20T10:00:00Z' },
    { score: 8, tags: ['work', 'grateful'], timestamp: '2026-07-22T10:00:00Z' },
    { score: 10, tags: ['holiday'], timestamp: '2026-07-12T10:00:00Z' },
  ]

  it('calculates raw average mood and common tags when privacy is disabled', () => {
    expect(
      aggregateMood(entries, {
        from: '2026-07-20T00:00:00Z',
        to: '2026-07-26T23:59:59Z',
        raw: true,
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

  it('suppresses aggregates for cohorts below the minimum size threshold', () => {
    // With 2 entries and default minCohortSize = 5, aggregate is suppressed
    const rollup = aggregateMood(entries, {
      from: '2026-07-20T00:00:00Z',
      to: '2026-07-26T23:59:59Z',
    })

    expect(rollup.suppressed).toBe(true)
    expect(rollup.averageScore).toBeNull()
    expect(rollup.entryCount).toBeNull()
    expect(rollup.mostCommonTags).toEqual([])

    // With explicit minCohortSize = 2, aggregate is not suppressed
    const unsuppressed = aggregateMood(entries, {
      from: '2026-07-20T00:00:00Z',
      to: '2026-07-26T23:59:59Z',
      minCohortSize: 2,
    })
    expect(unsuppressed.suppressed).toBeUndefined()
    expect(typeof unsuppressed.averageScore).toBe('number')
    expect(typeof unsuppressed.entryCount).toBe('number')
  })

  it('uses the current UTC week for the dashboard helper in raw mode', () => {
    const rollup = aggregateMoodThisWeek(entries, '2026-07-23T12:00:00Z', 5, { raw: true })
    expect(rollup.averageScore).toBe(6)
    expect(rollup.from).toBe('2026-07-20T00:00:00.000Z')
  })

  describe('differential privacy noise mechanism', () => {
    it('sampleLaplaceNoise produces zero on zero scale and respects boundaries', () => {
      expect(sampleLaplaceNoise(0)).toBe(0)
      expect(sampleLaplaceNoise(-1)).toBe(0)

      // Test with fixed RNG values
      // u = 0.5 -> center = 0
      expect(sampleLaplaceNoise(1.0, () => 0.5)).toBeCloseTo(0, 5)
    })

    it('injects deterministic Laplace noise with custom RNG', () => {
      const cohort = Array.from({ length: 10 }, (_, i) => ({
        score: 7,
        tags: ['focus'],
        timestamp: '2026-07-21T10:00:00Z',
      }))

      // With RNG returning 0.5 (center of uniform distribution), noise is 0
      const deterministicZero = aggregateMood(cohort, {
        from: '2026-07-20T00:00:00Z',
        to: '2026-07-26T23:59:59Z',
        privacy: {
          epsilon: 1.0,
          minCohortSize: 5,
          random: () => 0.5,
        },
      })

      expect(deterministicZero.averageScore).toBe(7.0)
      expect(deterministicZero.entryCount).toBe(10)
      expect(deterministicZero.mostCommonTags).toEqual([{ tag: 'focus', count: 10 }])
    })

    it('verifies statistical properties across repeated sampling', () => {
      // Cohort of 20 entries with true average = 7.0
      const cohort = [
        ...Array.from({ length: 10 }, () => ({
          score: 6,
          tags: ['neutral'],
          timestamp: '2026-07-21T10:00:00Z',
        })),
        ...Array.from({ length: 10 }, () => ({
          score: 8,
          tags: ['happy'],
          timestamp: '2026-07-21T10:00:00Z',
        })),
      ]

      const samples: number[] = []
      const counts: number[] = []
      const iterations = 2000

      for (let i = 0; i < iterations; i++) {
        const res = aggregateMood(cohort, {
          from: '2026-07-20T00:00:00Z',
          to: '2026-07-26T23:59:59Z',
          privacy: { epsilon: 1.0, minCohortSize: 5 },
        })
        if (res.averageScore !== null) samples.push(res.averageScore)
        if (res.entryCount !== null) counts.push(res.entryCount)
      }

      expect(samples.length).toBe(iterations)

      // Calculate empirical mean and variance of noisy average
      const mean = samples.reduce((acc, v) => acc + v, 0) / samples.length
      const variance =
        samples.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / samples.length

      // True mean is 7.0 — unbiased estimator
      expect(mean).toBeGreaterThanOrEqual(6.8)
      expect(mean).toBeLessThanOrEqual(7.2)

      // Theoretical scale b = 9 / (20 * 1.0) = 0.45. Theoretical variance = 2 * b^2 = 0.405
      // Clamping to [1, 10] slightly reduces extreme variance, but variance should be in [0.2, 0.6]
      expect(variance).toBeGreaterThan(0.15)
      expect(variance).toBeLessThan(0.65)

      // Count mean should be close to 20
      const countMean = counts.reduce((acc, v) => acc + v, 0) / counts.length
      expect(countMean).toBeGreaterThanOrEqual(19.5)
      expect(countMean).toBeLessThanOrEqual(20.5)
    })
  })
})

