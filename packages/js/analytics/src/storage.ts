import type { AnalyticsEvent, AnalyticsStorage, PurgeAuditRecord } from './types.js'

export const DEFAULT_STORAGE_KEY = 'echomirror.analytics.v1'
export const DEFAULT_AUDIT_KEY = 'echomirror.analytics.audit.v1'

export interface PersistedAnalyticsState {
  version: 1
  anonymousId: string
  sessionId: string
  userId?: string
  queue: AnalyticsEvent[]
}

export class MemoryStorage implements AnalyticsStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const fallbackStorage = new MemoryStorage()

export function defaultStorage(): AnalyticsStorage {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage
  } catch {
    // Access can throw when browser storage is disabled.
  }
  return fallbackStorage
}

function isEvent(value: unknown): value is AnalyticsEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<AnalyticsEvent>
  return (
    typeof event.id === 'string' &&
    typeof event.name === 'string' &&
    typeof event.timestamp === 'string' &&
    typeof event.anonymousId === 'string' &&
    typeof event.sessionId === 'string' &&
    !!event.properties &&
    typeof event.properties === 'object'
  )
}

export function readState(
  storage: AnalyticsStorage,
  key: string,
): PersistedAnalyticsState | undefined {
  const value = storage.getItem(key)
  if (!value) return undefined

  try {
    const parsed = JSON.parse(value) as Partial<PersistedAnalyticsState>
    if (
      parsed.version !== 1 ||
      typeof parsed.anonymousId !== 'string' ||
      typeof parsed.sessionId !== 'string' ||
      !Array.isArray(parsed.queue)
    ) {
      return undefined
    }

    const seen = new Set<string>()
    const queue = parsed.queue.filter((event) => {
      if (!isEvent(event) || seen.has(event.id)) return false
      seen.add(event.id)
      return true
    })

    return {
      version: 1,
      anonymousId: parsed.anonymousId,
      sessionId: parsed.sessionId,
      ...(typeof parsed.userId === 'string' ? { userId: parsed.userId } : {}),
      queue,
    }
  } catch {
    return undefined
  }
}

export function writeAuditRecord(
  storage: AnalyticsStorage,
  auditKey: string,
  record: PurgeAuditRecord,
): void {
  const existing = readAuditRecords(storage, auditKey)
  existing.push(record)
  try {
    storage.setItem(auditKey, JSON.stringify(existing))
  } catch {
    // Best-effort; audit failure should not block purge.
  }
}

export function readAuditRecords(
  storage: AnalyticsStorage,
  auditKey: string,
): PurgeAuditRecord[] {
  const value = storage.getItem(auditKey)
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is PurgeAuditRecord =>
        r !== null &&
        typeof r === 'object' &&
        typeof (r as PurgeAuditRecord).purgedAt === 'string' &&
        typeof (r as PurgeAuditRecord).userHash === 'string' &&
        typeof (r as PurgeAuditRecord).eventsRemoved === 'number',
    )
  } catch {
    return []
  }
}

export function purgeEventsByUserId(
  storage: AnalyticsStorage,
  storageKey: string,
  userId: string,
): { eventsRemoved: number; state: PersistedAnalyticsState } {
  const state = readState(storage, storageKey)
  if (!state) {
    return {
      eventsRemoved: 0,
      state: { version: 1, anonymousId: '', sessionId: '', queue: [] },
    }
  }

  const before = state.queue.length
  state.queue = state.queue.filter((event) => event.userId !== userId)
  const eventsRemoved = before - state.queue.length

  // Also strip userId from the state if it matches
  if (state.userId === userId) {
    delete state.userId
  }

  try {
    storage.setItem(storageKey, JSON.stringify(state))
  } catch {
    // Storage failure — still return the count so caller knows what happened.
  }

  return { eventsRemoved, state }
}

export function purgeEventsByAnonymousId(
  storage: AnalyticsStorage,
  storageKey: string,
  anonymousId: string,
): { eventsRemoved: number; state: PersistedAnalyticsState } {
  const state = readState(storage, storageKey)
  if (!state) {
    return {
      eventsRemoved: 0,
      state: { version: 1, anonymousId: '', sessionId: '', queue: [] },
    }
  }

  const before = state.queue.length
  state.queue = state.queue.filter((event) => event.anonymousId !== anonymousId)
  const eventsRemoved = before - state.queue.length

  try {
    storage.setItem(storageKey, JSON.stringify(state))
  } catch {
    // Storage failure — still return the count so caller knows what happened.
  }

  return { eventsRemoved, state }
}
