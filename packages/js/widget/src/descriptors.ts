import type { MoodScore } from '@echomirror/core'

export interface MoodDescriptor {
  /** Short human label, e.g. "Good". */
  label: string
  /** Emoji representing the mood. */
  emoji: string
  /** Semantic tone used for color theming: 0 (low) → 4 (great). */
  tone: 0 | 1 | 2 | 3 | 4
}

const DESCRIPTORS: Record<number, MoodDescriptor> = {
  1: { label: 'Awful', emoji: '😞', tone: 0 },
  2: { label: 'Terrible', emoji: '😣', tone: 0 },
  3: { label: 'Bad', emoji: '😔', tone: 1 },
  4: { label: 'Low', emoji: '😕', tone: 1 },
  5: { label: 'Meh', emoji: '😐', tone: 2 },
  6: { label: 'Okay', emoji: '🙂', tone: 2 },
  7: { label: 'Good', emoji: '😊', tone: 3 },
  8: { label: 'Great', emoji: '😄', tone: 3 },
  9: { label: 'Amazing', emoji: '🤩', tone: 4 },
  10: { label: 'Ecstatic', emoji: '🥳', tone: 4 },
}

export function moodDescriptor(score: MoodScore): MoodDescriptor {
  return DESCRIPTORS[score]
}

/** ARIA label for a given score button, e.g. "Mood 7 of 10: Good". */
export function moodAriaLabel(score: MoodScore): string {
  const d = moodDescriptor(score)
  return `Mood ${score} of 10: ${d.label}`
}
