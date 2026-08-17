import type { MoodTag } from '@echomirror/core'

/** Fixed API origin — it matches the single host_permission in the manifest. */
export const API_BASE_URL = 'https://api.echomirror.dev/v1'

export const SETTINGS_KEY = 'echomirror.settings.v1'
export const STATE_KEY = 'echomirror.state.v1'

export interface ExtensionSettings {
  version: 1
  /** EchoMirror API key (echomirror.dev/developers). Empty until configured. */
  apiKey: string
  network: 'mainnet' | 'testnet'
  /** Master opt-out for the daily reminder. */
  remindersEnabled: boolean
  /** Local wall-clock time for the reminder, 24h "HH:MM". */
  reminderTime: string
}

export interface ExtensionState {
  version: 1
  /** Local date ("YYYY-MM-DD") of the most recent known check-in. */
  lastLoggedDate: string | null
  /** Local date a reminder was last shown, so it fires at most once a day. */
  lastNotifiedDate: string | null
  /** Score of the most recent check-in, shown in the popup. */
  lastScore: number | null
  /** Streak counter from the last successful API call. */
  currentStreak: number
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  version: 1,
  apiKey: '',
  network: 'mainnet',
  remindersEnabled: true,
  reminderTime: '20:00',
}

export const DEFAULT_STATE: ExtensionState = {
  version: 1,
  lastLoggedDate: null,
  lastNotifiedDate: null,
  lastScore: null,
  currentStreak: 0,
}

/** Tags offered as one-tap chips in the popup. */
export const SUGGESTED_TAGS: MoodTag[] = [
  'work',
  'sleep',
  'health',
  'exercise',
  'social',
  'stress',
  'calm',
  'grateful',
]

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidReminderTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value)
}

/** Minutes past local midnight for an "HH:MM" string, or null if malformed. */
export function reminderTimeToMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function isDateKeyOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

/**
 * Coerce a persisted value back into settings, falling back to the defaults
 * field by field. Storage can hold anything an older build wrote, so every
 * field is validated rather than trusted.
 */
export function parseSettings(raw: unknown): ExtensionSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const value = raw as Partial<ExtensionSettings>
  return {
    version: 1,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey.trim() : DEFAULT_SETTINGS.apiKey,
    network: value.network === 'testnet' || value.network === 'mainnet'
      ? value.network
      : DEFAULT_SETTINGS.network,
    remindersEnabled: typeof value.remindersEnabled === 'boolean'
      ? value.remindersEnabled
      : DEFAULT_SETTINGS.remindersEnabled,
    reminderTime: isValidReminderTime(value.reminderTime)
      ? value.reminderTime
      : DEFAULT_SETTINGS.reminderTime,
  }
}

export function parseState(raw: unknown): ExtensionState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE }
  const value = raw as Partial<ExtensionState>
  return {
    version: 1,
    lastLoggedDate: isDateKeyOrNull(value.lastLoggedDate)
      ? value.lastLoggedDate
      : DEFAULT_STATE.lastLoggedDate,
    lastNotifiedDate: isDateKeyOrNull(value.lastNotifiedDate)
      ? value.lastNotifiedDate
      : DEFAULT_STATE.lastNotifiedDate,
    lastScore: typeof value.lastScore === 'number' && value.lastScore >= 1 && value.lastScore <= 10
      ? value.lastScore
      : DEFAULT_STATE.lastScore,
    currentStreak: typeof value.currentStreak === 'number' && value.currentStreak >= 0
      ? Math.floor(value.currentStreak)
      : DEFAULT_STATE.currentStreak,
  }
}
