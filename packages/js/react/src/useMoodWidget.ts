import {
  useCallback,
  useState,
  useEffect,
  useRef,
} from 'react'
import { EchoMirrorClient } from '@echomirror/core'
import type {
  MoodEntry,
  MoodScore,
  MoodTag,
} from '@echomirror/core'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MoodWidgetTheme = {
  /** Base background color */
  background: string
  /** Surface color for cards/panels */
  surface: string
  /** Primary accent color */
  primary: string
  /** Secondary accent color */
  secondary: string
  /** Text color on primary backgrounds */
  primaryText: string
  /** Main body text color */
  text: string
  /** Muted / secondary text color */
  mutedText: string
  /** Border color */
  border: string
  /** Success / positive color */
  success: string
  /** Error / negative color */
  error: string
  /** Focus ring color */
  focus: string
}

export const DEFAULT_THEME: MoodWidgetTheme = {
  background: '#ffffff',
  surface: '#f3f4f6',
  primary: '#6366f1',
  secondary: '#e5e7eb',
  primaryText: '#ffffff',
  text: '#111827',
  mutedText: '#6b7280',
  border: '#d1d5db',
  success: '#10b981',
  error: '#ef4444',
  focus: '#6366f1',
}

export type MoodWidgetState = 'idle' | 'selecting' | 'submitting' | 'success' | 'error'

export interface UseMoodWidgetOptions {
  /** EchoMirror client instance */
  client: EchoMirrorClient
  /** Initial mood score (1-10) */
  initialScore?: MoodScore
  /** Optional note pre-filled */
  initialNote?: string
  /** Optional tags pre-selected */
  initialTags?: MoodTag[]
  /** Theme overrides merged over defaults */
  theme?: Partial<MoodWidgetTheme>
  /** Callback fired when a mood is successfully submitted */
  onMoodLogged?: (entry: MoodEntry) => void
  /** Callback fired when submission fails */
  onError?: (error: Error) => void
}

export interface UseMoodWidgetReturn {
  /** Current widget state */
  state: MoodWidgetState
  /** Selected mood score (1-10) */
  score: MoodScore | null
  /** Current note text */
  note: string
  /** Selected tags */
  tags: MoodTag[]
  /** Whether the widget is in dark mode (derived from theme background luminance) */
  isDark: boolean
  /** Resolved theme (defaults + overrides) */
  theme: MoodWidgetTheme
  /** Error message if state is 'error', null otherwise */
  error: Error | null
  /** Select a mood score */
  selectScore: (score: MoodScore) => void
  /** Set the note text */
  setNote: (note: string) => void
  /** Toggle a tag on/off */
  toggleTag: (tag: MoodTag) => void
  /** Submit the mood entry */
  submit: () => Promise<void>
  /** Reset the widget to idle state */
  reset: () => void
  /** Clear the error and return to idle */
  clearError: () => void
}

/**
 * Headless hook powering <MoodWidget />. Handles score selection, note input,
 * tag toggling, optimistic submission, error/retry states, and theming.
 * Framework-agnostic core logic — the React component is a thin wrapper.
 */
export function useMoodWidget(options: UseMoodWidgetOptions): UseMoodWidgetReturn {
  const {
    client,
    initialScore = null,
    initialNote = '',
    initialTags = [],
    theme: themeOverride,
    onMoodLogged,
    onError,
  } = options

  const [state, setState] = useState<MoodWidgetState>('idle')
  const [score, setScoreState] = useState<MoodScore | null>(initialScore)
  const [note, setNoteState] = useState(initialNote)
  const [tags, setTagsState] = useState<MoodTag[]>(initialTags)
  const [error, setErrorState] = useState<Error | null>(null)

  const themeRef = useRef<MoodWidgetTheme>({ ...DEFAULT_THEME, ...themeOverride })

  // Derive dark mode from theme background luminance
  const isDark = (() => {
    const bg = themeRef.current.background
    // Simple luminance check for hex colors
    const match = bg.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
    if (!match) return false
    const r = parseInt(match[1], 16)
    const g = parseInt(match[2], 16)
    const b = parseInt(match[3], 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.5
  })()

  const theme: MoodWidgetTheme = themeRef.current

  const selectScore = useCallback((newScore: MoodScore) => {
    setScoreState(newScore)
    setState('selecting')
    setErrorState(null)
  }, [])

  const setNote = useCallback((newNote: string) => {
    setNoteState(newNote)
    setErrorState(null)
  }, [])

  const toggleTag = useCallback((tag: MoodTag) => {
    setTagsState((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
    setErrorState(null)
  }, [])

  const submit = useCallback(async () => {
    if (!score) return
    setState('submitting')
    setErrorState(null)

    try {
      const entry = await client.request<MoodEntry>('POST', '/mood/entries', {
        score,
        note: note || undefined,
        tags: tags.length ? tags : undefined,
      })

      // Emit local event so parent apps can react
      ;(client as EchoMirrorClient & { emit?: (event: { type: string; entry: MoodEntry }) => void }).emit?.({
        type: 'mood:logged',
        entry,
      })

      setState('success')
      onMoodLogged?.(entry)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setState('error')
      setErrorState(error)
      onError?.(error)
    }
  }, [client, score, note, tags, onMoodLogged, onError])

  const reset = useCallback(() => {
    setState('idle')
    setScoreState(initialScore)
    setNoteState(initialNote)
    setTagsState(initialTags)
    setErrorState(null)
  }, [initialScore, initialNote, initialTags])

  const clearError = useCallback(() => {
    setState('idle')
    setErrorState(null)
  }, [])

  return {
    state,
    score,
    note,
    tags,
    isDark,
    theme,
    error,
    selectScore,
    setNote,
    toggleTag,
    submit,
    reset,
    clearError,
  }
}
