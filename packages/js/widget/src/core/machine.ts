import type { EchoMirrorClient, MoodEntry, MoodScore, MoodTag } from '@echomirror/core'
import { logMood } from '@echomirror/mood'
import type { LogMoodPayload } from '@echomirror/mood'

// ─── Types ───────────────────────────────────────────────────────────────────

export type MoodWidgetStatus = 'idle' | 'submitting' | 'success' | 'error'

export interface MoodWidgetState {
  /** Currently selected mood score (1–10), or null if none chosen yet. */
  score: MoodScore | null
  /** Free-text note accompanying the mood entry. */
  note: string
  /** Tags the user has toggled on. */
  tags: MoodTag[]
  /** Lifecycle status of the submit flow. */
  status: MoodWidgetStatus
  /** The recorded entry (provisional in optimistic mode until confirmed). */
  entry: MoodEntry | null
  /** Human-readable error message when status === 'error'. */
  error: string | null
  /** True once an optimistic entry has been confirmed by the server. */
  confirmed: boolean
  /** Epoch ms of the last state mutation — handy for vanilla change diffing. */
  lastUpdatedAt: number | null
}

export interface MoodWidgetSnapshot extends MoodWidgetState {
  /** Derived: can the form currently be submitted? */
  canSubmit: boolean
  /** Derived: whether a score is required and currently missing. */
  missingScore: boolean
}

export interface MoodWidgetOptions {
  /** Authenticated EchoMirror client used to persist the mood entry. */
  client: EchoMirrorClient
  /** Initial score (1–10). Defaults to null (unselected). */
  initialScore?: MoodScore | null
  /** Initial note text. */
  initialNote?: string
  /** Initial selected tags. */
  initialTags?: MoodTag[]
  /** Pool of tags offered in the UI. Defaults to the core mood tag set. */
  availableTags?: MoodTag[]
  /** Require a score before submit is allowed (default true). */
  requireScore?: boolean
  /** Transition to success immediately, before the server confirms (default true). */
  optimistic?: boolean
  /** Fired after a successful (or optimistic) submission. */
  onSubmit?: (entry: MoodEntry) => void
  /** Fired when the submission fails. */
  onError?: (error: Error) => void
  /**
   * Map the current widget state to the payload sent to `logMood`.
   * Useful to attach Stellar reward metadata or transform tags.
   */
  mapPayload?: (state: MoodWidgetState) => LogMoodPayload
}

export type MoodWidgetListener = (snapshot: MoodWidgetSnapshot) => void

export interface MoodWidgetController {
  /** Read the current immutable snapshot. */
  getSnapshot: () => MoodWidgetSnapshot
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe: (listener: MoodWidgetListener) => () => void
  /** Set / clear the mood score. */
  setScore: (score: MoodScore | null) => void
  /** Update the note text. */
  setNote: (note: string) => void
  /** Toggle a single tag on/off. */
  toggleTag: (tag: MoodTag) => void
  /** Replace the full selected-tag set. */
  setTags: (tags: MoodTag[]) => void
  /** Submit the current mood. Safe to call again to retry after an error. */
  submit: () => Promise<MoodEntry | null>
  /** Reset back to the initial idle state, keeping the configured options. */
  reset: () => void
  /** Alias for `submit()` used after an error. */
  retry: () => Promise<MoodEntry | null>
  /** Tear down timers/listeners. */
  destroy: () => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_TAGS: MoodTag[] = [
  'work',
  'relationships',
  'health',
  'sleep',
  'exercise',
  'creativity',
  'outdoors',
  'social',
  'food',
  'stress',
  'proud',
  'grateful',
  'anxious',
  'calm',
]

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return 'Something went wrong while saving your mood. Please try again.'
}

function clampScore(value: number): MoodScore {
  const rounded = Math.round(value)
  const capped = Math.min(10, Math.max(1, rounded))
  return capped as MoodScore
}

function buildEntry(state: MoodWidgetState): MoodEntry {
  const now = new Date().toISOString()
  return {
    id: `optimistic-${now}`,
    userId: '',
    score: state.score as MoodScore,
    note: state.note.trim() ? state.note.trim() : undefined,
    tags: [...state.tags],
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Machine ─────────────────────────────────────────────────────────────────

export function createMoodWidget(options: MoodWidgetOptions): MoodWidgetController {
  const {
    client,
    optimistic = true,
    requireScore = true,
    onSubmit,
    onError,
    mapPayload,
  } = options

  let state: MoodWidgetState = {
    score: options.initialScore ?? null,
    note: options.initialNote ?? '',
    tags: [...(options.initialTags ?? [])],
    status: 'idle',
    entry: null,
    error: null,
    confirmed: false,
    lastUpdatedAt: null,
  }

  const listeners = new Set<MoodWidgetListener>()
  let inFlight: Promise<MoodEntry | null> | null = null

  function computeSnapshot(): MoodWidgetSnapshot {
    const missingScore = requireScore && state.score == null
    return {
      ...state,
      missingScore,
      canSubmit: state.status !== 'submitting' && !missingScore,
    }
  }

  let currentSnapshot: MoodWidgetSnapshot = computeSnapshot()

  function emit() {
    state = { ...state, lastUpdatedAt: Date.now() }
    currentSnapshot = computeSnapshot()
    listeners.forEach((l) => l(currentSnapshot))
  }

  function setScore(score: MoodScore | null) {
    state = { ...state, score: score == null ? null : clampScore(score) }
    emit()
  }

  function setNote(note: string) {
    state = { ...state, note }
    emit()
  }

  function toggleTag(tag: MoodTag) {
    const has = state.tags.includes(tag)
    state = {
      ...state,
      tags: has ? state.tags.filter((t) => t !== tag) : [...state.tags, tag],
    }
    emit()
  }

  function setTags(tags: MoodTag[]) {
    state = { ...state, tags: [...tags] }
    emit()
  }

  function payload(): LogMoodPayload {
    if (mapPayload) return mapPayload(state)
    return {
      score: state.score as MoodScore,
      note: state.note.trim() ? state.note.trim() : undefined,
      tags: [...state.tags],
    }
  }

  async function submit(): Promise<MoodEntry | null> {
    if (inFlight) return inFlight
    if (requireScore && state.score == null) {
      state = { ...state, status: 'error', error: 'Please choose a mood first.' }
      emit()
      return null
    }

    state = { ...state, status: 'submitting', error: null }
    emit()

    if (optimistic) {
      const provisional = buildEntry(state)
      state = { ...state, status: 'success', entry: provisional, confirmed: false }
      emit()
      onSubmit?.(provisional)
    }

    const run = async (): Promise<MoodEntry | null> => {
      try {
        const entry = await logMood(client, payload())
        state = { ...state, status: 'success', entry, confirmed: true, error: null }
        emit()
        if (!optimistic) onSubmit?.(entry)
        return entry
      } catch (err) {
        const message = errorMessage(err)
        // Roll back optimistic success to an error state, preserving input.
        state = {
          ...state,
          status: 'error',
          error: message,
          entry: optimistic ? null : state.entry,
          confirmed: false,
        }
        emit()
        onError?.(err instanceof Error ? err : new Error(message))
        return null
      } finally {
        inFlight = null
      }
    }

    inFlight = run()
    return inFlight
  }

  function reset() {
    inFlight = null
    state = {
      score: options.initialScore ?? null,
      note: options.initialNote ?? '',
      tags: [...(options.initialTags ?? [])],
      status: 'idle',
      entry: null,
      error: null,
      confirmed: false,
      lastUpdatedAt: null,
    }
    emit()
  }

  function subscribe(listener: MoodWidgetListener) {
    listeners.add(listener)
    listener(currentSnapshot)
    return () => listeners.delete(listener)
  }

  function destroy() {
    listeners.clear()
    inFlight = null
  }

  return {
    getSnapshot: () => currentSnapshot,
    subscribe,
    setScore,
    setNote,
    toggleTag,
    setTags,
    submit,
    reset,
    retry: submit,
    destroy,
  }
}

export { DEFAULT_TAGS, clampScore }
