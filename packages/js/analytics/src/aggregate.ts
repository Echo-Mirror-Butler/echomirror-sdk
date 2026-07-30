import type {
  MoodAggregateInput,
  MoodRollup,
  MoodRollupOptions,
} from './types.js'

function asDate(value: string | number | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid analytics date')
  return date
}

/**
 * Computes mood statistics locally. Raw tags are never added to the analytics queue.
 */
export function aggregateMood(
  entries: readonly MoodAggregateInput[],
  options: MoodRollupOptions,
): MoodRollup {
  const from = asDate(options.from)
  const to = asDate(options.to)
  if (from > to) throw new RangeError('Mood rollup "from" must be before "to"')

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

  return {
    averageScore: entryCount === 0 ? null : scoreTotal / entryCount,
    entryCount,
    mostCommonTags,
    from: from.toISOString(),
    to: to.toISOString(),
  }
}

/** Returns a Monday-through-now UTC rollup for dashboard widgets. */
export function aggregateMoodThisWeek(
  entries: readonly MoodAggregateInput[],
  now: string | number | Date = new Date(),
  tagLimit = 5,
): MoodRollup {
  const to = asDate(now)
  const from = new Date(to)
  const day = from.getUTCDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  from.setUTCDate(from.getUTCDate() - daysSinceMonday)
  from.setUTCHours(0, 0, 0, 0)
  return aggregateMood(entries, { from, to, tagLimit })
}
