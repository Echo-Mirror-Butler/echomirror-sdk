import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useMoodWidget, type MoodWidgetTheme, type MoodScore, type MoodTag, DEFAULT_THEME } from './useMoodWidget'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MoodWidgetProps {
  /** EchoMirror client instance */
  client: import('@echomirror/core').EchoMirrorClient
  /** Initial mood score (1-10) */
  initialScore?: MoodScore
  /** Initial note text */
  initialNote?: string
  /** Initial tags */
  initialTags?: MoodTag[]
  /** Theme overrides merged over defaults */
  theme?: Partial<MoodWidgetTheme>
  /** Callback fired on successful submission */
  onMoodLogged?: (entry: import('@echomirror/core').MoodEntry) => void
  /** Callback fired on submission error */
  onError?: (error: Error) => void
  /** Additional CSS class */
  className?: string
}

// ─── Mood tag labels ──────────────────────────────────────────────────────────

const TAG_LABELS: Record<MoodTag, string> = {
  work: 'Work',
  relationships: 'Relationships',
  health: 'Health',
  sleep: 'Sleep',
  exercise: 'Exercise',
  creativity: 'Creativity',
  outdoors: 'Outdoors',
  social: 'Social',
  food: 'Food',
  stress: 'Stress',
  proud: 'Proud',
  grateful: 'Grateful',
  anxious: 'Anxious',
  calm: 'Calm',
}

// ─── Score label map ──────────────────────────────────────────────────────────

const SCORE_LABELS: Record<number, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Low',
  4: 'Fair',
  5: 'Fair',
  6: 'Good',
  7: 'Good',
  8: 'Great',
  9: 'Excellent',
  10: 'Perfect',
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * <MoodWidget /> — drop-in mood logging component with full theming,
 * accessibility, optimistic UI, and error/retry states.
 *
 * Wraps the headless `useMoodWidget` hook. Use standalone or inside
 * `<EchoMirrorProvider>`.
 *
 * @example
 * <MoodWidget client={client} onMoodLogged={(entry) => console.log(entry)} />
 */
export function MoodWidget({
  client,
  initialScore,
  initialNote,
  initialTags,
  theme: themeOverride,
  onMoodLogged,
  onError,
  className,
}: MoodWidgetProps) {
  const {
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
  } = useMoodWidget({
    client,
    initialScore,
    initialNote,
    initialTags,
    theme: themeOverride,
    onMoodLogged,
    onError,
  })

  const submitBtnRef = useRef<HTMLButtonElement>(null)
  const scoreBtnRefs = useRef<Record<number, HTMLButtonElement | null>>({})

  // Auto-focus submit button on success
  useEffect(() => {
    if (state === 'success' && submitBtnRef.current) {
      submitBtnRef.current.focus()
    }
  }, [state])

  const canSubmit = score !== null && state !== 'submitting' && state !== 'success'

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (state === 'error') {
        if (e.key === 'Escape') {
          clearError()
        }
        return
      }
      // Number keys 1-10 select scores
      const key = e.key
      if (key >= '1' && key <= '9') {
        e.preventDefault()
        selectScore(parseInt(key, 10) as MoodScore)
      } else if (key === '0') {
        e.preventDefault()
        selectScore(10 as MoodScore)
      }
      // Enter submits
      if (e.key === 'Enter' && canSubmit) {
        e.preventDefault()
        void submit()
      }
    },
    [state, canSubmit, selectScore, submit, clearError],
  )

  const isSelected = (s: MoodScore) => score === s

  return (
    <section
      role="region"
      aria-label="Mood widget"
      aria-live="polite"
      className={[
        'em-mood-widget',
        isDark ? 'em-mood-widget--dark' : 'em-mood-widget--light',
        className,
      ].filter(Boolean).join(' ')}
      style={{
        '--em-bg': theme.background,
        '--em-surface': theme.surface,
        '--em-primary': theme.primary,
        '--em-secondary': theme.secondary,
        '--em-primary-text': theme.primaryText,
        '--em-text': theme.text,
        '--em-muted-text': theme.mutedText,
        '--em-border': theme.border,
        '--em-success': theme.success,
        '--em-error': theme.error,
        '--em-focus': theme.focus,
      }}
      onKeyDown={handleKeyDown}
    >
      {/* ─── Error state ─── */}
      {state === 'error' && error && (
        <div
          role="alert"
          aria-live="assertive"
          className="em-mood-widget__error"
          style={{
            background: theme.error,
            color: '#ffffff',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>
            Failed to log mood. {error.message}
          </p>
          <button
            type="button"
            onClick={clearError}
            className="em-mood-widget__error-dismiss"
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#ffffff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginLeft: '12px',
              fontSize: '14px',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── Success state ─── */}
      {state === 'success' && (
        <div
          role="status"
          aria-live="polite"
          className="em-mood-widget__success"
          style={{
            background: theme.success,
            color: '#ffffff',
            padding: '16px 20px',
            borderRadius: '8px',
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>
            Mood logged! 🎉
          </p>
          <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
            Score: {score}/10
          </p>
          <button
            ref={submitBtnRef}
            type="button"
            onClick={reset}
            className="em-mood-widget__log-again"
            style={{
              background: 'transparent',
              border: `1px solid rgba(255,255,255,0.5)`,
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '12px',
              fontSize: '14px',
            }}
          >
            Log another mood
          </button>
        </div>
      )}

      {/* ─── Idle / Selecting state ─── */}
      {state === 'idle' || state === 'selecting' ? (
        <>
          {/* Score picker */}
          <div
            className="em-mood-widget__score-picker"
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '20px',
              flexWrap: 'wrap',
            }}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => {
              const selected = isSelected(s as MoodScore)
              return (
                <button
                  key={s}
                  type="button"
                  ref={(el) => {
                    scoreBtnRefs.current[s] = el
                  }}
                  onClick={() => selectScore(s as MoodScore)}
                  aria-pressed={selected}
                  aria-valuenow={s}
                  style={{
                    flex: 1,
                    minWidth: '44px',
                    height: '44px',
                    border: `2px solid ${selected ? theme.primary : theme.border}`,
                    borderRadius: '10px',
                    background: selected ? theme.primary : theme.background,
                    color: selected ? theme.primaryText : theme.text,
                    fontWeight: selected ? 700 : 400,
                    fontSize: '18px',
                    cursor: canSubmit ? 'pointer' : 'default',
                    opacity: canSubmit ? 1 : 0.5,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {s}
                </button>
              )
            })}
          </div>

          {/* Score label */}
          {score && (
            <p
              className="em-mood-widget__score-label"
              style={{
                margin: '0 0 16px 0',
                fontSize: '14px',
                color: theme.mutedText,
                textAlign: 'center',
              }}
            >
              {SCORE_LABELS[score]}
            </p>
          )}

          {/* Note input */}
          <div
            className="em-mood-widget__note"
            style={{ marginBottom: '16px' }}
          >
            <label
              htmlFor="mood-note"
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: theme.text,
                marginBottom: '6px',
              }}
            >
              Notes (optional)
            </label>
            <textarea
              id="mood-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="How are you feeling?..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                background: theme.background,
                color: theme.text,
                fontSize: '14px',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Tag chips */}
          <div
            className="em-mood-widget__tags"
            style={{ marginBottom: '20px' }}
          >
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: theme.text,
                marginBottom: '8px',
              }}
            >
              Tags
            </label>
            <div
              role="group"
              aria-label="Mood tags"
              style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              {Object.entries(TAG_LABELS).map(([tag, label]) => {
                const isActive = tags.includes(tag as MoodTag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag as MoodTag)}
                    aria-pressed={isActive}
                    className="em-mood-widget__tag"
                    style={{
                      padding: '6px 12px',
                      border: `1px solid ${isActive ? theme.primary : theme.border}`,
                      borderRadius: '20px',
                      background: isActive ? theme.primary : theme.surface,
                      color: isActive ? theme.primaryText : theme.text,
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Submit button */}
          <button
            ref={submitBtnRef}
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="em-mood-widget__submit"
            style={{
              width: '100%',
              padding: '14px 20px',
              border: 'none',
              borderRadius: '10px',
              background: canSubmit ? theme.primary : theme.secondary,
              color: canSubmit ? theme.primaryText : theme.mutedText,
              fontSize: '16px',
              fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'default',
              opacity: canSubmit ? 1 : 0.5,
              transition: 'all 0.15s ease',
            }}
          >
            {state === 'submitting' ? 'Logging…' : 'Log Mood'}
          </button>
        </>
      ) : null}
    </section>
  )
}
