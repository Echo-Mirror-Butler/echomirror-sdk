/**
 * Background service worker.
 *
 * Keeps one chrome.alarms alarm pointed at the user's reminder time, and when
 * it fires checks (against the API first, local state as fallback) whether a
 * mood was logged today — showing a single notification if not.
 *
 * The worker is suspended between events: all state lives in
 * chrome.storage.local and every handler re-reads it.
 */
import { fetchStreak } from './lib/api'
import {
  REMINDER_ALARM,
  REMINDER_NOTIFICATION,
  localDateKey,
  nextReminderTimestamp,
  shouldRemind,
} from './lib/reminder'
import { SETTINGS_KEY, STATE_KEY } from './lib/settings'
import { settingsStore, stateStore } from './lib/storage'

async function scheduleReminder(): Promise<void> {
  const settings = await settingsStore.read()
  if (!settings.remindersEnabled || !settings.apiKey) {
    await chrome.alarms.clear(REMINDER_ALARM)
    return
  }
  const when = nextReminderTimestamp(new Date(), settings.reminderTime)
  // periodInMinutes is a safety net: if the browser is closed at `when`, the
  // alarm fires on the next startup and the daily period keeps it alive after.
  chrome.alarms.create(REMINDER_ALARM, { when, periodInMinutes: 24 * 60 })
}

async function refreshBadge(): Promise<void> {
  const [settings, state] = await Promise.all([settingsStore.read(), stateStore.read()])
  const pending = Boolean(settings.apiKey) && state.lastLoggedDate !== localDateKey(new Date())
  await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' })
  await chrome.action.setBadgeText({ text: pending ? '•' : '' })
}

/**
 * Reconcile the local "logged today" marker with the API. Mood entries can be
 * created from any EchoMirror client, so the streak endpoint is the source of
 * truth; a failed request leaves the local marker untouched.
 */
async function syncLoggedToday(): Promise<void> {
  const settings = await settingsStore.read()
  if (!settings.apiKey) return
  try {
    const streak = await fetchStreak(settings)
    const patch = { currentStreak: streak.current }
    if (streak.isActiveToday) {
      await stateStore.write({ ...patch, lastLoggedDate: localDateKey(new Date()) })
    } else {
      await stateStore.write(patch)
    }
  } catch {
    // Offline or rate limited — fall back to the locally recorded check-in.
  }
}

async function notifyIfDue(): Promise<void> {
  await syncLoggedToday()

  const now = new Date()
  const [settings, state] = await Promise.all([settingsStore.read(), stateStore.read()])
  if (!shouldRemind(now, settings, state)) return

  await stateStore.write({ lastNotifiedDate: localDateKey(now) })
  chrome.notifications.create(REMINDER_NOTIFICATION, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'How was your day?',
    message: state.currentStreak > 0
      ? `You have a ${state.currentStreak}-day streak going. Click to check in.`
      : 'You have not logged a mood today. Click to check in.',
    priority: 1,
  })
}

chrome.runtime.onInstalled.addListener(() => {
  void scheduleReminder().then(refreshBadge)
})

chrome.runtime.onStartup.addListener(() => {
  void scheduleReminder().then(refreshBadge)
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== REMINDER_ALARM) return
  void notifyIfDue()
    .then(refreshBadge)
    .then(scheduleReminder)
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (SETTINGS_KEY in changes) void scheduleReminder().then(refreshBadge)
  else if (STATE_KEY in changes) void refreshBadge()
})

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId !== REMINDER_NOTIFICATION) return
  chrome.notifications.clear(notificationId)
  void chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') })
})
