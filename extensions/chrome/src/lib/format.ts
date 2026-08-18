/** Face for a 1–10 mood score, used in the popup and on the score slider. */
const SCORE_FACES = ['😫', '😟', '😕', '😐', '🙂', '😊', '😄', '😁', '🤩', '🚀']

export function scoreFace(score: number): string {
  const index = Math.min(10, Math.max(1, Math.round(score))) - 1
  return SCORE_FACES[index]
}

export function streakLabel(current: number): string {
  if (current <= 0) return ''
  return `${current} day${current === 1 ? '' : 's'} streak`
}
