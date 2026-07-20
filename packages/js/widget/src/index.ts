export { MoodWidget } from './MoodWidget'
export type { MoodWidgetProps } from './MoodWidget'

export { useMoodWidget } from './useMoodWidget'
export type { UseMoodWidgetResult } from './useMoodWidget'

// Headless core (framework-agnostic)
export {
  createMoodWidget,
  DEFAULT_TAGS,
  clampScore,
} from './core/machine'
export type {
  MoodWidgetController,
  MoodWidgetOptions,
  MoodWidgetState,
  MoodWidgetStatus,
  MoodWidgetSnapshot,
  MoodWidgetListener,
} from './core/machine'

// Theming
export {
  createTheme,
  defaultThemes,
  lightTheme,
  darkTheme,
  themeToCssVars,
} from './theme'
export type { Theme, ThemeAppearance } from './theme'

// Mood semantics (shared by React + vanilla)
export { moodDescriptor, moodAriaLabel } from './descriptors'
export type { MoodDescriptor } from './descriptors'

// Copy / i18n
export { defaultLabels } from './labels'
export type { MoodWidgetLabels } from './labels'

// Inline stylesheet (also available as `@echomirror/widget/styles.css`)
export { WIDGET_CSS } from './styles'
