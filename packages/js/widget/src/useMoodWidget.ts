import { useEffect, useRef, useState } from 'react'
import { useSyncExternalStore } from 'use-sync-external-store/shim'
import {
  createMoodWidget,
  type MoodWidgetController,
  type MoodWidgetOptions,
  type MoodWidgetSnapshot,
} from './core/machine'

export interface UseMoodWidgetResult extends MoodWidgetSnapshot {
  /** Imperative controller (also usable from vanilla/non-React code). */
  controller: MoodWidgetController
  setScore: MoodWidgetController['setScore']
  setNote: MoodWidgetController['setNote']
  toggleTag: MoodWidgetController['toggleTag']
  setTags: MoodWidgetController['setTags']
  submit: MoodWidgetController['submit']
  reset: MoodWidgetController['reset']
  retry: MoodWidgetController['retry']
}

/**
 * Headless React hook for the MoodWidget. Owns the framework-agnostic
 * {@link MoodWidgetController} and exposes its state via `useSyncExternalStore`.
 *
 * The component `<MoodWidget />` is a thin wrapper around this hook — and the
 * same controller powers the vanilla-js example, so Vue/Svelte wrappers can be
 * added later without rewriting any logic.
 *
 * @example
 * const widget = useMoodWidget({ client })
 * return <button onClick={() => widget.submit()}>Save</button>
 */
export function useMoodWidget(options: MoodWidgetOptions): UseMoodWidgetResult {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [controller] = useState(() =>
    createMoodWidget({
      ...options,
      onSubmit: (entry) => optionsRef.current.onSubmit?.(entry),
      onError: (err) => optionsRef.current.onError?.(err),
    }),
  )

  useEffect(() => () => controller.destroy(), [controller])

  const subscribe = controller.subscribe
  const getSnapshot = controller.getSnapshot

  // `useSyncExternalStore` is the idiomatic way to bridge an external store to React.
  const snap = useSyncExternalStore(subscribe as never, getSnapshot as never)

  return {
    ...(snap as MoodWidgetSnapshot),
    controller,
    setScore: controller.setScore,
    setNote: controller.setNote,
    toggleTag: controller.toggleTag,
    setTags: controller.setTags,
    submit: controller.submit,
    reset: controller.reset,
    retry: controller.retry,
  }
}
