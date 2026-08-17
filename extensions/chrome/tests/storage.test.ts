import { describe, expect, it, vi } from 'vitest'
import { PersistedRecord, type ChangeHandler, type StorageArea } from '../src/lib/storage'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  parseSettings,
  parseState,
  type ExtensionSettings,
} from '../src/lib/settings'

function fakeArea(initial: Record<string, unknown> = {}) {
  const items = { ...initial }
  const area: StorageArea = {
    get: async (keys) => {
      if (keys === null) return { ...items }
      const list = Array.isArray(keys) ? keys : [keys]
      return Object.fromEntries(list.filter((k) => k in items).map((k) => [k, items[k]]))
    },
    set: async (patch) => {
      Object.assign(items, patch)
    },
    remove: async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete items[key]
    },
  }
  return { area, items }
}

const settingsRecord = (area: StorageArea) =>
  new PersistedRecord<ExtensionSettings>(SETTINGS_KEY, DEFAULT_SETTINGS, parseSettings, area)

describe('PersistedRecord', () => {
  it('returns defaults when nothing is stored', async () => {
    const { area } = fakeArea()
    expect(await settingsRecord(area).read()).toEqual(DEFAULT_SETTINGS)
  })

  it('merges a patch over the stored record', async () => {
    const { area, items } = fakeArea()
    const record = settingsRecord(area)

    await record.write({ apiKey: 'em_live_abc' })
    const stored = await record.write({ reminderTime: '07:30' })

    expect(stored).toEqual({ ...DEFAULT_SETTINGS, apiKey: 'em_live_abc', reminderTime: '07:30' })
    expect(items[SETTINGS_KEY]).toEqual(stored)
  })

  it('repairs values written by an incompatible build', async () => {
    const { area } = fakeArea({
      [SETTINGS_KEY]: { apiKey: 42, network: 'solana', reminderTime: '99:99', remindersEnabled: 'yes' },
    })
    expect(await settingsRecord(area).read()).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults when the storage area throws', async () => {
    const area: StorageArea = {
      get: () => Promise.reject(new Error('storage unavailable')),
      set: async () => {},
      remove: async () => {},
    }
    expect(await settingsRecord(area).read()).toEqual(DEFAULT_SETTINGS)
  })

  it('clears the key on reset', async () => {
    const { area, items } = fakeArea()
    const record = settingsRecord(area)
    await record.write({ apiKey: 'em_live_abc' })

    await record.reset()

    expect(items[SETTINGS_KEY]).toBeUndefined()
    expect(await record.read()).toEqual(DEFAULT_SETTINGS)
  })

  it('notifies watchers about local writes only', () => {
    const { area } = fakeArea()
    const handlers: ChangeHandler[] = []
    const emitter = {
      addListener: (h: ChangeHandler) => handlers.push(h),
      removeListener: (h: ChangeHandler) => handlers.splice(handlers.indexOf(h), 1),
    }
    const listener = vi.fn()
    const unwatch = settingsRecord(area).watch(emitter, listener)

    handlers[0]({ [SETTINGS_KEY]: { newValue: { apiKey: 'em_live_abc' } } }, 'sync')
    handlers[0]({ 'other.key': { newValue: {} } }, 'local')
    expect(listener).not.toHaveBeenCalled()

    handlers[0]({ [SETTINGS_KEY]: { newValue: { apiKey: 'em_live_abc' } } }, 'local')
    expect(listener).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, apiKey: 'em_live_abc' })

    unwatch()
    expect(handlers).toHaveLength(0)
  })
})

describe('parseState', () => {
  it('drops malformed dates and scores', () => {
    expect(
      parseState({ lastLoggedDate: '17/08/2026', lastScore: 42, currentStreak: -3 }),
    ).toEqual({
      version: 1,
      lastLoggedDate: null,
      lastNotifiedDate: null,
      lastScore: null,
      currentStreak: 0,
    })
  })

  it('keeps valid values', () => {
    expect(parseState({ lastLoggedDate: '2026-08-17', lastScore: 8, currentStreak: 4.7 })).toEqual({
      version: 1,
      lastLoggedDate: '2026-08-17',
      lastNotifiedDate: null,
      lastScore: 8,
      currentStreak: 4,
    })
  })
})
