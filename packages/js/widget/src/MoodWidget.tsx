import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { EchoMirrorClient, MoodScore, MoodTag } from '@echomirror/core'
import { useMoodWidget } from './useMoodWidget'
import { DEFAULT_TAGS, type MoodWidgetOptions } from './core/machine'
import { createTheme, themeToCssVars, type Theme, type ThemeAppearance } from './theme'
import { moodAriaLabel, moodDescriptor } from './descriptors'
import { defaultLabels, type MoodWidgetLabels } from './labels'
import { WIDGET_CSS } from './styles'

let stylesInjected = false
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  if (document.getElementById('emw-styles')) {
    stylesInjected = true
    return
  }
  const el = document.createElement('style')
  el.id = 'emw-styles'
  el.textContent = WIDGET_CSS
  document.head.appendChild(el)
  stylesInjected = true
}

export interface MoodWidgetProps {
  /** Authenticated EchoMirror client used to persist the mood entry. */
  client: EchoMirrorClient
  /** Partial theme overrides merged over the chosen appearance theme. */
  theme?: Partial<Theme>
  /** Light (default) or dark. */
  appearance?: ThemeAppearance
  initialScore?: MoodScore
  initialNote?: string
  initialTags?: MoodTag[]
  /** Tag pool shown in the picker. Defaults to the full mood tag set. */
  availableTags?: MoodTag[]
  /** Require a score before allowing submit (default true). */
  requireScore?: boolean
  /** Optimistic success transition (default true). */
  optimistic?: boolean
  /** Hide the tag picker entirely. */
  hideTags?: boolean
  /** Extra class on the root element. */
  className?: string
  /** Inline styles merged onto the root element. */
  style?: CSSProperties
  /** i18n / copy overrides. */
  labels?: Partial<MoodWidgetLabels>
  onSubmit?: MoodWidgetOptions['onSubmit']
  onError?: MoodWidgetOptions['onError']
  mapPayload?: MoodWidgetOptions['mapPayload']
}

/**
 * Production-ready mood logger: a themed, fully accessible picker with an
 * optimistic submit flow and first-class error/retry handling.
 *
 * Built on the headless {@link useMoodWidget} hook, so the same logic powers
 * the vanilla-js example and any future framework wrapper.
 */
export function MoodWidget(props: MoodWidgetProps) {
  const {
    client,
    theme,
    appearance = 'light',
    initialScore,
    initialNote,
    initialTags,
    availableTags,
    requireScore,
    optimistic,
    hideTags = false,
    className,
    style,
    labels: labelOverrides,
    onSubmit,
    onError,
    mapPayload,
  } = props

  const labels = useMemo<MoodWidgetLabels>(
    () => ({ ...defaultLabels, ...labelOverrides }),
    [labelOverrides],
  )

  const widget = useMoodWidget({
    client,
    initialScore,
    initialNote,
    initialTags,
    availableTags,
    requireScore,
    optimistic,
    onSubmit,
    onError,
    mapPayload,
  })

  const { score, note, tags, status, entry, error, confirmed, missingScore } = widget

  const resolvedTheme = useMemo(
    () => createTheme(appearance, theme),
    [appearance, theme],
  )
  const cssVars = useMemo(
    () => themeToCssVars(resolvedTheme) as CSSProperties,
    [resolvedTheme],
  )

  const baseId = useId()
  const liveId = `${baseId}-live`
  const pickerId = `${baseId}-picker`
  const noteId = `${baseId}-note`
  const tagsId = `${baseId}-tags`

  const scoreRefs = useRef<(HTMLButtonElement | null)[]>([])
  const successRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    ensureStyles()
  }, [])

  // Focus management: move focus to the actionable control on terminal states.
  useEffect(() => {
    if (status === 'success') successRef.current?.focus()
    else if (status === 'error') retryRef.current?.focus()
  }, [status])

  const focusScore = (value: number) => {
    const el = scoreRefs.current[value - 1]
    if (el) el.focus()
  }

  const onPickerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const max = 10
    const min = 1
    let next: number | null = null
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = score == null ? min : Math.min(max, score + 1)
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        next = score == null ? max : Math.max(min, score - 1)
        break
      case 'Home':
        next = min
        break
      case 'End':
        next = max
        break
      default:
        return
    }
    e.preventDefault()
    widget.setScore(next as MoodScore)
    // Defer focus until after React commits the roving tabindex.
    requestAnimationFrame(() => focusScore(next as number))
  }

  const liveMessage =
    status === 'submitting'
      ? labels.submitting
      : status === 'success'
        ? confirmed
          ? labels.successTitle
          : labels.syncing
        : status === 'error'
          ? `${labels.errorTitle}: ${error ?? ''}`
          : ''

  const rootStyle: CSSProperties = {
    ...cssVars,
    ...(style ?? {}),
  }

  return (
    <section
      className={className ? `emw ${className}` : 'emw'}
      style={rootStyle}
      aria-label={labels.title}
    >
      {/* Live region: announces status changes to screen readers. */}
      <div id={liveId} aria-live="polite" aria-atomic="true" className="emw__sr-only">
        {liveMessage}
      </div>

      {status === 'success' && entry ? (
        <SuccessPanel
          entry={entry}
          confirmed={confirmed}
          labels={labels}
          onLogAnother={() => widget.reset()}
          successRef={successRef}
        />
      ) : (
        <>
          <h2 className="emw__title">{labels.title}</h2>

          <div
            id={pickerId}
            className="emw__picker"
            role="radiogroup"
            aria-labelledby={`${pickerId}-label`}
            aria-required={requireScore ?? true}
            aria-disabled={status === 'submitting'}
            onKeyDown={onPickerKeyDown}
          >
            <span id={`${pickerId}-label`} className="emw__sr-only">
              {labels.pickerLabel}
            </span>
            <span className="emw__label" aria-hidden="true">
              {labels.pickerLabel}
              <span className="emw__current" aria-hidden="true">
                {score != null ? `${score}/10 · ${moodDescriptor(score).label}` : '—'}
              </span>
            </span>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => {
              const checked = score === value
              const d = moodDescriptor(value as MoodScore)
              return (
                <button
                  key={value}
                  ref={(el) => {
                    scoreRefs.current[value - 1] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={moodAriaLabel(value as MoodScore)}
                  title={`${d.emoji} ${d.label}`}
                  tabIndex={checked || (score == null && value === 1) ? 0 : -1}
                  className="emw__score"
                  disabled={status === 'submitting'}
                  onClick={() => widget.setScore(value as MoodScore)}
                >
                  <span aria-hidden="true">{d.emoji}</span>
                </button>
              )
            })}
          </div>

          {missingScore && status === 'error' ? (
            <p className="emw__status emw__status--error" role="alert">
              {labels.requiredHint}
            </p>
          ) : null}

          <label htmlFor={noteId} className="emw__label">
            {labels.noteLabel}
          </label>
          <textarea
            id={noteId}
            className="emw__note"
            placeholder={labels.notePlaceholder}
            value={note}
            disabled={status === 'submitting'}
            onChange={(e) => widget.setNote(e.target.value)}
          />

          {!hideTags ? (
            <div id={tagsId}>
              <span className="emw__label" id={`${tagsId}-label`}>
                {labels.tagsLabel}
              </span>
              <div className="emw__tags" role="group" aria-labelledby={`${tagsId}-label`}>
                {(availableTags ?? DEFAULT_TAGS).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="emw__tag"
                    aria-pressed={tags.includes(tag)}
                    disabled={status === 'submitting'}
                    onClick={() => widget.toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="emw__submit"
            onClick={() => void widget.submit()}
            disabled={!widget.canSubmit}
            aria-busy={status === 'submitting'}
          >
            {status === 'submitting' ? labels.submitting : labels.submit}
          </button>

          {status === 'error' && error ? (
            <div className="emw__panel emw__panel--error" role="alert">
              <p className="emw__panel-title">{labels.errorTitle}</p>
              <p className="emw__panel-note">{error}</p>
              <div className="emw__panel-actions">
                <button
                  ref={retryRef}
                  type="button"
                  className="emw__link"
                  onClick={() => void widget.retry()}
                >
                  {labels.retry}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

interface SuccessPanelProps {
  entry: { score: MoodScore; note?: string }
  confirmed: boolean
  labels: MoodWidgetLabels
  onLogAnother: () => void
  successRef: RefObject<HTMLButtonElement>
}

function SuccessPanel({
  entry,
  confirmed,
  labels,
  onLogAnother,
  successRef,
}: SuccessPanelProps) {
  const d = moodDescriptor(entry.score)
  return (
    <div className="emw__panel" role="status" aria-live="polite">
      <p className="emw__panel-title">
        <span className="emw__panel-emoji" aria-hidden="true">
          {d.emoji}
        </span>
        {labels.successTitle}
      </p>
      <p className="emw__panel-note">
        {d.label} ({entry.score}/10){entry.note ? ` — ${entry.note}` : ''}
      </p>
      <p className="emw__status emw__status--success">
        {confirmed ? labels.successBody : labels.syncing}
      </p>
      <div className="emw__panel-actions">
        <button ref={successRef} type="button" className="emw__link" onClick={onLogAnother}>
          {labels.logAnother}
        </button>
      </div>
    </div>
  )
}
