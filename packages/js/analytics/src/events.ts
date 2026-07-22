import type { MoodEntry } from '@echomirror/core'
import type { DomainEventMap } from './types'

export function moodLoggedProperties(
  entry: Pick<MoodEntry, 'score' | 'tags' | 'note'>,
): DomainEventMap['mood_logged'] {
  return {
    score: entry.score,
    tagCount: entry.tags.length,
    hasNote: typeof entry.note === 'string' && entry.note.length > 0,
  }
}
