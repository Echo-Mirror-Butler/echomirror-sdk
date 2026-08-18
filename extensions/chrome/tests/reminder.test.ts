import { describe, expect, it } from 'vitest'
import { localDateKey, nextReminderTimestamp, shouldRemind } from '../src/lib/reminder'
import { DEFAULT_SETTINGS, DEFAULT_STATE } from '../src/lib/settings'

const settings = { ...DEFAULT_SETTINGS, apiKey: 'em_live_abc', reminderTime: '20:00' }
const at = (hours: number, minutes = 0) => new Date(2026, 7, 17, hours, minutes)

describe('localDateKey', () => {
  it('formats the local calendar day, zero padded', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('nextReminderTimestamp', () => {
  it('uses today when the time is still ahead', () => {
    expect(nextReminderTimestamp(at(9), '20:00')).toBe(at(20).getTime())
  })

  it('rolls over to tomorrow once the time has passed', () => {
    const next = new Date(nextReminderTimestamp(at(20, 1), '20:00'))
    expect(localDateKey(next)).toBe('2026-08-18')
    expect(next.getHours()).toBe(20)
  })

  it('falls back to 20:00 for a malformed time', () => {
    expect(nextReminderTimestamp(at(9), 'half past nine')).toBe(at(20).getTime())
  })
})

describe('shouldRemind', () => {
  it('fires once the configured time has passed with no check-in', () => {
    expect(shouldRemind(at(20), settings, DEFAULT_STATE)).toBe(true)
  })

  it('stays quiet before the configured time', () => {
    expect(shouldRemind(at(19, 59), settings, DEFAULT_STATE)).toBe(false)
  })

  it('stays quiet after a check-in today', () => {
    const state = { ...DEFAULT_STATE, lastLoggedDate: '2026-08-17' }
    expect(shouldRemind(at(21), settings, state)).toBe(false)
  })

  it('fires again the day after the last check-in', () => {
    const state = { ...DEFAULT_STATE, lastLoggedDate: '2026-08-16' }
    expect(shouldRemind(at(21), settings, state)).toBe(true)
  })

  it('never repeats a reminder within the same day', () => {
    const state = { ...DEFAULT_STATE, lastNotifiedDate: '2026-08-17' }
    expect(shouldRemind(at(23), settings, state)).toBe(false)
  })

  it('respects the opt-out toggle', () => {
    expect(shouldRemind(at(21), { ...settings, remindersEnabled: false }, DEFAULT_STATE)).toBe(false)
  })

  it('does not nag a user who has not configured an API key', () => {
    expect(shouldRemind(at(21), { ...settings, apiKey: '' }, DEFAULT_STATE)).toBe(false)
  })
})
