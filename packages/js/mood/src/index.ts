import type { EchoMirrorClient } from '@echomirror/core'
import type {
  MoodEntry,
  MoodScore,
  MoodTag,
  MoodStreak,
  MoodSummary,
  AIReflection,
} from '@echomirror/core'

export interface LogMoodPayload {
  score: MoodScore
  note?: string
  tags?: MoodTag[]
}

export interface GetMoodHistoryOptions {
  limit?: number
  offset?: number
  from?: string
  to?: string
  tags?: MoodTag[]
  minScore?: MoodScore
  maxScore?: MoodScore
}

/**
 * Log a mood entry for the authenticated user.
 *
 * @example
 * const entry = await logMood(client, { score: 7, note: 'Great day', tags: ['work'] })
 */
export async function logMood(
  client: EchoMirrorClient,
  payload: LogMoodPayload,
): Promise<MoodEntry> {
  const entry = await client.request<MoodEntry>('POST', '/mood/entries', payload)
  client.emit({ type: 'mood:logged', entry })
  return entry
}

/**
 * Get paginated mood history for the authenticated user.
 */
export async function getMoodHistory(
  client: EchoMirrorClient,
  options: GetMoodHistoryOptions = {},
): Promise<{ entries: MoodEntry[]; total: number }> {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))
  if (options.from) params.set('from', options.from)
  if (options.to) params.set('to', options.to)
  if (options.minScore) params.set('min_score', String(options.minScore))
  if (options.maxScore) params.set('max_score', String(options.maxScore))
  if (options.tags?.length) params.set('tags', options.tags.join(','))
  return client.request('GET', `/mood/entries?${params}`)
}

/**
 * Get a single mood entry by ID.
 */
export async function getMoodEntry(
  client: EchoMirrorClient,
  entryId: string,
): Promise<MoodEntry> {
  return client.request('GET', `/mood/entries/${entryId}`)
}

/**
 * Delete a mood entry.
 */
export async function deleteMoodEntry(
  client: EchoMirrorClient,
  entryId: string,
): Promise<void> {
  return client.request('DELETE', `/mood/entries/${entryId}`)
}

/**
 * Get the user's current and longest streak.
 *
 * @example
 * const streak = await getMoodStreak(client)
 * if (!streak.isActiveToday) {
 *   showCheckInPrompt()
 * }
 */
export async function getMoodStreak(client: EchoMirrorClient): Promise<MoodStreak> {
  return client.request('GET', '/mood/streak')
}

/**
 * Get aggregated mood statistics for a time period.
 */
export async function getMoodSummary(
  client: EchoMirrorClient,
  period: 'week' | 'month' | 'year' | 'all' = 'week',
): Promise<MoodSummary> {
  return client.request('GET', `/mood/summary?period=${period}`)
}

/**
 * Request an AI reflection for a specific mood entry.
 * Reflections are generated asynchronously — poll or use webhooks.
 */
export async function requestAIReflection(
  client: EchoMirrorClient,
  entryId: string,
): Promise<AIReflection> {
  return client.request('POST', `/mood/entries/${entryId}/reflect`)
}

/**
 * Get the AI reflection for a mood entry (once generated).
 */
export async function getAIReflection(
  client: EchoMirrorClient,
  entryId: string,
): Promise<AIReflection | null> {
  return client.request('GET', `/mood/entries/${entryId}/reflection`)
}

export type { MoodEntry, MoodScore, MoodTag, MoodStreak, MoodSummary, AIReflection }
