import type { AnalyticsEvent } from './types'

export interface TagCount {
  tag: string
  count: number
}

export interface RangeOptions {
  since?: number
  until?: number
}

function withinRange(timestamp: string, options: RangeOptions): boolean {
  const t = Date.parse(timestamp)
  if (Number.isNaN(t)) return false
  if (options.since !== undefined && t < options.since) return false
  if (options.until !== undefined && t > options.until) return false
  return true
}

export function averageMoodScore(
  events: AnalyticsEvent[],
  options: RangeOptions = {},
): number | null {
  const scores: number[] = []
  for (const event of events) {
    if (event.event !== 'mood_logged') continue
    if (!withinRange(event.timestamp, options)) continue
    const score = event.properties.score
    if (typeof score === 'number') scores.push(score)
  }
  if (scores.length === 0) return null
  const total = scores.reduce((sum, value) => sum + value, 0)
  return total / scores.length
}

export function mostCommonTags(
  events: AnalyticsEvent[],
  limit = 5,
): TagCount[] {
  const counts = new Map<string, number>()
  for (const event of events) {
    const tags = event.properties.tags
    if (!Array.isArray(tags)) continue
    for (const tag of tags) {
      if (typeof tag !== 'string') continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function eventCounts(events: AnalyticsEvent[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const event of events) {
    counts[event.event] = (counts[event.event] ?? 0) + 1
  }
  return counts
}

export function activeDays(events: AnalyticsEvent[]): number {
  const days = new Set<string>()
  for (const event of events) {
    days.add(event.timestamp.slice(0, 10))
  }
  return days.size
}
