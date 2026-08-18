import {
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  SETTINGS_KEY,
  STATE_KEY,
  parseSettings,
  parseState,
  type ExtensionSettings,
  type ExtensionState,
} from './settings'

/**
 * The slice of chrome.storage.StorageArea this wrapper needs. Narrowing it to
 * an interface keeps the record testable without a browser.
 */
export interface StorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

export type ChangeHandler = (changes: Record<string, { newValue?: unknown }>, area: string) => void

export interface ChangeEmitter {
  addListener(handler: ChangeHandler): void
  removeListener(handler: ChangeHandler): void
}

/**
 * A single validated record persisted in chrome.storage.local.
 *
 * Mirrors the read / validate / fall-back-to-defaults shape
 * @echomirror/analytics uses for its own persistence, but backed by
 * chrome.storage.local: service workers are restarted between events and have
 * no localStorage, so every read goes to storage and nothing is cached in
 * module scope.
 */
export class PersistedRecord<T extends object> {
  constructor(
    readonly key: string,
    private readonly defaults: T,
    private readonly parse: (raw: unknown) => T,
    private readonly area: StorageArea,
  ) {}

  async read(): Promise<T> {
    try {
      const items = await this.area.get(this.key)
      return this.parse(items[this.key])
    } catch {
      // Storage can be unavailable (quota, profile teardown); defaults keep
      // the UI usable instead of throwing inside an event handler.
      return { ...this.defaults }
    }
  }

  /** Merge a patch over the stored record and return the persisted result. */
  async write(patch: Partial<T>): Promise<T> {
    const next = this.parse({ ...(await this.read()), ...patch })
    await this.area.set({ [this.key]: next })
    return next
  }

  async reset(): Promise<void> {
    await this.area.remove(this.key)
  }

  /** Watch this key for writes made elsewhere (worker, popup, options page). */
  watch(emitter: ChangeEmitter, listener: (value: T) => void): () => void {
    const handler: ChangeHandler = (changes, area) => {
      if (area !== 'local' || !(this.key in changes)) return
      listener(this.parse(changes[this.key].newValue))
    }
    emitter.addListener(handler)
    return () => emitter.removeListener(handler)
  }
}

/**
 * chrome.* is touched lazily so importing this module outside an extension
 * (unit tests, build scripts) does not throw.
 */
const localArea: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
}

export const settingsStore = new PersistedRecord<ExtensionSettings>(
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  parseSettings,
  localArea,
)

export const stateStore = new PersistedRecord<ExtensionState>(
  STATE_KEY,
  DEFAULT_STATE,
  parseState,
  localArea,
)

/** chrome.storage.onChanged, wrapped so callers can pass a fake in tests. */
export function storageChanges(): ChangeEmitter {
  return chrome.storage.onChanged as unknown as ChangeEmitter
}
