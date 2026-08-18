import { reminderTimeToMinutes, type ExtensionSettings, type ExtensionState } from './settings'

export const REMINDER_ALARM = 'echomirror.reminder'
export const REMINDER_NOTIFICATION = 'echomirror.reminder.notification'

/** Local calendar day as "YYYY-MM-DD" — days are the unit a streak counts in. */
export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Timestamp of the next occurrence of the configured reminder time. Today's
 * slot is used while it is still ahead, otherwise tomorrow's.
 */
export function nextReminderTimestamp(now: Date, reminderTime: string): number {
  const minutes = reminderTimeToMinutes(reminderTime)
  const target = new Date(now)
  target.setHours(0, minutes === null ? 20 * 60 : minutes, 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  return target.getTime()
}

/**
 * Whether a reminder is due right now.
 *
 * Alarms can fire late (the browser was closed at the scheduled moment), so
 * this is evaluated against the clock rather than assuming the alarm is
 * punctual: the reminder is due once the configured time has passed on a day
 * with no check-in and no reminder shown yet.
 */
export function shouldRemind(
  now: Date,
  settings: ExtensionSettings,
  state: ExtensionState,
): boolean {
  if (!settings.remindersEnabled) return false
  if (!settings.apiKey) return false

  const due = reminderTimeToMinutes(settings.reminderTime)
  if (due === null) return false
  if (now.getHours() * 60 + now.getMinutes() < due) return false

  const today = localDateKey(now)
  return state.lastLoggedDate !== today && state.lastNotifiedDate !== today
}
