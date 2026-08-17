/**
 * Options page — API key/session, reminder time, and the reminder opt-out.
 * Everything is persisted through the same chrome.storage.local wrapper the
 * popup and the service worker read.
 */
import { describeError, fetchStreak } from './lib/api'
import { isValidReminderTime, type ExtensionSettings } from './lib/settings'
import { settingsStore, stateStore } from './lib/storage'

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

function setStatus(node: HTMLElement, message: string, kind: 'error' | 'success' | ''): void {
  node.textContent = message
  node.className = kind ? `status ${kind}` : 'status'
}

async function main(): Promise<void> {
  const form = el<HTMLFormElement>('settings')
  const apiKey = el<HTMLInputElement>('api-key')
  const toggleKey = el<HTMLButtonElement>('toggle-key')
  const network = el<HTMLSelectElement>('network')
  const remindersEnabled = el<HTMLInputElement>('reminders-enabled')
  const reminderTime = el<HTMLInputElement>('reminder-time')
  const test = el<HTMLButtonElement>('test')
  const clear = el<HTMLButtonElement>('clear')
  const status = el('status')

  const apply = (settings: ExtensionSettings) => {
    apiKey.value = settings.apiKey
    network.value = settings.network
    remindersEnabled.checked = settings.remindersEnabled
    reminderTime.value = settings.reminderTime
  }

  apply(await settingsStore.read())

  toggleKey.addEventListener('click', () => {
    const hidden = apiKey.type === 'password'
    apiKey.type = hidden ? 'text' : 'password'
    toggleKey.textContent = hidden ? 'Hide' : 'Show'
    toggleKey.setAttribute('aria-pressed', String(hidden))
  })

  const collect = (): ExtensionSettings | null => {
    if (!isValidReminderTime(reminderTime.value)) {
      setStatus(status, 'Pick a reminder time in 24-hour HH:MM format.', 'error')
      return null
    }
    return {
      version: 1,
      apiKey: apiKey.value.trim(),
      network: network.value === 'testnet' ? 'testnet' : 'mainnet',
      remindersEnabled: remindersEnabled.checked,
      reminderTime: reminderTime.value,
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const next = collect()
    if (!next) return
    apply(await settingsStore.write(next))
    setStatus(status, 'Settings saved.', 'success')
  })

  test.addEventListener('click', async () => {
    const next = collect()
    if (!next) return
    if (!next.apiKey) {
      setStatus(status, 'Enter an API key first.', 'error')
      return
    }
    test.disabled = true
    setStatus(status, 'Checking…', '')
    try {
      const streak = await fetchStreak(next)
      setStatus(
        status,
        `Connected. Current streak: ${streak.current} day${streak.current === 1 ? '' : 's'}.`,
        'success',
      )
    } catch (error) {
      setStatus(status, describeError(error), 'error')
    } finally {
      test.disabled = false
    }
  })

  clear.addEventListener('click', async () => {
    await Promise.all([settingsStore.reset(), stateStore.reset()])
    apply(await settingsStore.read())
    setStatus(status, 'Stored key, preferences and check-in history cleared.', 'success')
  })
}

void main()
