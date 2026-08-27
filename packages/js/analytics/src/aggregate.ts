import type {
  MoodAggregateInput,
  MoodRollup,
  MoodRollupOptions,
} from './types.js'

export const DEFAULT_EPSILON = 1.0
export const DEFAULT_MIN_COHORT_SIZE = 5

function asDate(value: string | number | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid analytics date')
  return date
}

/**
 * Samples a value from the zero-mean Laplace distribution with scale parameter b.
 * PDF: f(x) = (1 / (2b)) * exp(-|x| / b).
 *
 * @param scale The Laplace scale b = sensitivity / epsilon. If scale <= 0, returns 0.
 * @param random Optional RNG returning a float in [0, 1). Defaults to Math.random.
 */
export function sampleLaplaceNoise(scale: number, random: () => number = Math.random): number {
  if (scale <= 0 || !Number.isFinite(scale)) return 0
  const u = Math.max(1e-15, Math.min(1 - 1e-15, random())) - 0.5
  return -Math.sign(u) * scale * Math.log(1 - 2 * Math.abs(u))
}

/**
 * Computes mood statistics locally with differential-privacy noise injection and small-cohort suppression.
 * Raw tags and personal identifiers are never added to the analytics queue.
 */
export function aggregateMood(
  entries: readonly MoodAggregateInput[],
  options: MoodRollupOptions,
): MoodRollup {
  const from = asDate(options.from)
  const to = asDate(options.to)
  if (from > to) throw new RangeError('Mood rollup "from" must be before "to"')

  // Resolve differential privacy configuration
  const rawMode =
    options.raw === true ||
    options.privacy === false ||
    (typeof options.privacy === 'object' && options.privacy !== null && options.privacy.enabled === false)

  let epsilon = DEFAULT_EPSILON
  let minCohortSize = DEFAULT_MIN_COHORT_SIZE
  let rng: () => number = Math.random

  if (typeof options.privacy === 'object' && options.privacy !== null) {
    if (
      typeof options.privacy.epsilon === 'number' &&
      Number.isFinite(options.privacy.epsilon) &&
      options.privacy.epsilon > 0
    ) {
      epsilon = options.privacy.epsilon
    }
    if (
      typeof options.privacy.minCohortSize === 'number' &&
      Number.isFinite(options.privacy.minCohortSize)
    ) {
      minCohortSize = Math.max(0, options.privacy.minCohortSize)
    }
    if (typeof options.privacy.random === 'function') {
      rng = options.privacy.random
    }
  }

  if (typeof options.epsilon === 'number' && Number.isFinite(options.epsilon) && options.epsilon > 0) {
    epsilon = options.epsilon
  }
  if (
    typeof options.minCohortSize === 'number' &&
    Number.isFinite(options.minCohortSize)
  ) {
    minCohortSize = Math.max(0, options.minCohortSize)
  }

  const tagCounts = new Map<string, number>()
  let scoreTotal = 0
  let entryCount = 0

  for (const entry of entries) {
    const timestamp = asDate(entry.timestamp)
    if (timestamp < from || timestamp > to || !Number.isFinite(entry.score)) continue

    scoreTotal += entry.score
    entryCount += 1
    for (const tag of entry.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }

  const tagLimit = Math.max(0, options.tagLimit ?? 5)
  const mostCommonTags = [...tagCounts.entries()]
    .sort(([leftTag, leftCount], [rightTag, rightCount]) => {
      return rightCount - leftCount || leftTag.localeCompare(rightTag)
    })
    .slice(0, tagLimit)
    .map(([tag, count]) => ({ tag, count }))

  // If raw mode is explicitly enabled, return exact values
  if (rawMode) {
    return {
      averageScore: entryCount === 0 ? null : scoreTotal / entryCount,
      entryCount,
      mostCommonTags,
      from: from.toISOString(),
      to: to.toISOString(),
    }
  }

  // Small cohort suppression: do not return noisy aggregates for tiny groups
  if (entryCount < minCohortSize) {
    return {
      averageScore: null,
      entryCount: null,
      mostCommonTags: [],
      from: from.toISOString(),
      to: to.toISOString(),
      suppressed: true,
    }
  }

  // Apply differential privacy noise (Laplace mechanism)
  const rawAverage = scoreTotal / entryCount
  // Score sensitivity Δ = 9 for scores in range [1, 10]
  const averageScale = 9 / (entryCount * epsilon)
  const noisyAverage = Math.max(
    1,
    Math.min(10, Number((rawAverage + sampleLaplaceNoise(averageScale, rng)).toFixed(2))),
  )

  // Count sensitivity Δ = 1
  const countScale = 1 / epsilon
  const noisyCount = Math.max(0, Math.round(entryCount + sampleLaplaceNoise(countScale, rng)))
  const noisyTags = mostCommonTags.map(({ tag, count }) => ({
    tag,
    count: Math.max(0, Math.round(count + sampleLaplaceNoise(countScale, rng))),
  }))

  return {
    averageScore: noisyAverage,
    entryCount: noisyCount,
    mostCommonTags: noisyTags,
    from: from.toISOString(),
    to: to.toISOString(),
  }
}

/** Returns a Monday-through-now UTC rollup for dashboard widgets. */
export function aggregateMoodThisWeek(
  entries: readonly MoodAggregateInput[],
  now: string | number | Date = new Date(),
  tagLimit = 5,
  options?: Omit<MoodRollupOptions, 'from' | 'to' | 'tagLimit'>,
): MoodRollup {
  const to = asDate(now)
  const from = new Date(to)
  const day = from.getUTCDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  from.setUTCDate(from.getUTCDate() - daysSinceMonday)
  from.setUTCHours(0, 0, 0, 0)
  return aggregateMood(entries, { from, to, tagLimit, ...options })
}
