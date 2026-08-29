import { sanitizeProperties } from './privacy.js'
import {
  DEFAULT_STORAGE_KEY,
  defaultStorage,
  readState,
  writeAuditRecord,
  readAuditRecords,
  purgeEventsByUserId,
  purgeEventsByAnonymousId,
  DEFAULT_AUDIT_KEY,
  type PersistedAnalyticsState,
} from './storage.js'
import type {
  AIReflectionViewedProperties,
  AnalyticsBatch,
  AnalyticsConfig,
  AnalyticsEvent,
  AnalyticsEventMap,
  AnalyticsEventName,
  AnalyticsStorage,
  EventProperties,
  FriendFollowedProperties,
  GiftSentProperties,
  LeaderboardViewedProperties,
  MoodLoggedProperties,
  PurgeAuditRecord,
  PurgeResult,
  StreakMilestoneReachedProperties,
  WalletConnectedProperties,
} from './types.js'

const DEFAULT_BATCH_SIZE = 20
const DEFAULT_FLUSH_INTERVAL_MS = 10_000

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export class AnalyticsClient {
  private readonly config: AnalyticsConfig
  private readonly storage: AnalyticsStorage
  private readonly storageKey: string
  private readonly batchSize: number
  private readonly flushIntervalMs: number
  private state: PersistedAnalyticsState
  private timer?: ReturnType<typeof setInterval>
  private activeFlush?: Promise<void>

  constructor(config: AnalyticsConfig) {
    if (!config || typeof config.transport !== 'function') {
      throw new TypeError('AnalyticsClient requires a transport function')
    }

    this.config = config
    this.storage = config.storage ?? defaultStorage()
    this.storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
    if (!Number.isInteger(this.batchSize) || this.batchSize <= 0) {
      throw new RangeError('Analytics batchSize must be a positive integer')
    }
    if (!Number.isFinite(this.flushIntervalMs) || this.flushIntervalMs < 0) {
      throw new RangeError('Analytics flushIntervalMs must be zero or greater')
    }

    const stored = this.readPersistedState()
    this.state =
      stored ??
      ({
        version: 1,
        anonymousId: this.newId('anon'),
        sessionId: this.newId('session'),
        queue: [],
      } satisfies PersistedAnalyticsState)
    this.persist()
    this.start()
  }

  /** Track a built-in typed event or a custom event name. */
  track<Name extends string>(
    eventName: Name,
    properties: Name extends AnalyticsEventName ? AnalyticsEventMap[Name] : EventProperties,
  ): AnalyticsEvent {
    if (typeof eventName !== 'string' || eventName.trim().length === 0) {
      throw new TypeError('Analytics eventName must be a non-empty string')
    }

    return this.enqueue(eventName, properties as Record<string, unknown>)
  }

  trackMoodLogged(properties: MoodLoggedProperties): AnalyticsEvent {
    return this.track('mood_logged', properties)
  }

  trackStreakMilestoneReached(
    properties: StreakMilestoneReachedProperties,
  ): AnalyticsEvent {
    return this.track('streak_milestone_reached', properties)
  }

  trackGiftSent(properties: GiftSentProperties): AnalyticsEvent {
    return this.track('gift_sent', properties)
  }

  trackWalletConnected(properties: WalletConnectedProperties): AnalyticsEvent {
    return this.track('wallet_connected', properties)
  }

  trackAIReflectionViewed(properties: AIReflectionViewedProperties): AnalyticsEvent {
    return this.track('ai_reflection_viewed', properties)
  }

  trackFriendFollowed(properties: FriendFollowedProperties = {}): AnalyticsEvent {
    return this.track('friend_followed', properties)
  }

  trackLeaderboardViewed(properties: LeaderboardViewedProperties): AnalyticsEvent {
    return this.track('leaderboard_viewed', properties)
  }

  /**
   * Associates both queued anonymous events and future events with a signed-in user.
   * A stitch event also lets a server alias anonymous events that were already delivered.
   */
  identify(userId: string): void {
    const normalizedUserId = userId.trim()
    if (!normalizedUserId) throw new TypeError('Analytics userId must be a non-empty string')
    if (this.state.userId === normalizedUserId) return

    const previousAnonymousId = this.state.anonymousId
    this.state.userId = normalizedUserId
    // Only stamp events that aren't already attributed to a (different) user —
    // switching identity must not silently re-attribute another user's history.
    this.state.queue = this.state.queue.map((event) =>
      event.userId
        ? event
        : {
            ...event,
            userId: normalizedUserId,
          },
    )
    this.persist()
    this.enqueue('identity_stitched', { previousAnonymousId })
  }

  /** Clears authenticated identity while retaining the stable anonymous device ID. */
  resetUser(): void {
    delete this.state.userId
    this.state.sessionId = this.newId('session')
    this.persist()
  }

  /** Starts timed flushing. Calling this more than once is safe. */
  start(): void {
    if (this.timer || this.flushIntervalMs === 0) return
    this.timer = setInterval(() => {
      void this.flush().catch((error: unknown) => this.reportError(error))
    }, this.flushIntervalMs)

    const nodeTimer = this.timer as ReturnType<typeof setInterval> & { unref?: () => void }
    nodeTimer.unref?.()
  }

  /** Stops timed flushing without discarding the persistent queue. */
  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  /** Flushes all currently queued batches. Failed batches remain persisted for retry. */
  flush(): Promise<void> {
    if (this.activeFlush) return this.activeFlush
    this.activeFlush = this.flushQueue().finally(() => {
      this.activeFlush = undefined
    })
    return this.activeFlush
  }

  /** Returns a snapshot suitable for queue counters and debugging. */
  getPendingEvents(): AnalyticsEvent[] {
    return this.state.queue.map((event) => ({
      ...event,
      properties: { ...event.properties },
    }))
  }

  getIdentity(): { anonymousId: string; sessionId: string; userId?: string } {
    return {
      anonymousId: this.state.anonymousId,
      sessionId: this.state.sessionId,
      ...(this.state.userId ? { userId: this.state.userId } : {}),
    }
  }

  /**
   * Purges all stored events for a given user identifier (right-to-erasure).
   *
   * Matches on both `userId` and `anonymousId` fields. Events in the local queue
   * that match the identifier are permanently removed. The persisted state is
   * rewritten without those events.
   *
   * **Aggregate rollups are not affected.** The `aggregateMood` and
   * `aggregateMoodThisWeek` functions operate on caller-provided arrays, not on
   * stored events. Historical aggregates that were computed before this purge
   * will retain the deleted user's contribution. Only future aggregates computed
   * from the remaining data will exclude them.
   *
   * @param identifier - The user ID or anonymous ID to purge. Must be a non-empty string.
   * @returns A result indicating how many events were removed and an audit record.
   */
  purgeUser(identifier: string): PurgeResult {
    const id = identifier.trim()
    if (!id) throw new TypeError('purgeUser identifier must be a non-empty string')

    const auditKey = this.config.auditStorageKey ?? DEFAULT_AUDIT_KEY
    const storage = this.storage

    // Purge by userId
    const userIdResult = purgeEventsByUserId(storage, this.storageKey, id)
    // Purge by anonymousId
    const anonResult = purgeEventsByAnonymousId(storage, this.storageKey, id)

    const eventsRemoved = userIdResult.eventsRemoved + anonResult.eventsRemoved

    // anonResult reads storage after the userId purge already wrote back, so
    // its state reflects both filters — always the correct final state.
    const finalState = anonResult.state

    // If the current in-memory state matches, update it
    if (this.state.anonymousId === finalState.anonymousId || this.state.sessionId === finalState.sessionId) {
      this.state = finalState
    }

    // Build an opaque user hash — never store the raw identifier in the audit log
    const userHash = this.hashIdentifier(id)

    const audit: PurgeAuditRecord = {
      purgedAt: this.now().toISOString(),
      userHash,
      eventsRemoved,
      storageKey: this.storageKey,
    }

    writeAuditRecord(storage, auditKey, audit)

    return { purged: eventsRemoved > 0, eventsRemoved, audit }
  }

  /**
   * Returns the audit log of all purge requests executed on this storage.
   * Records contain NO PII — only an opaque hash of the purged identifier,
   * the timestamp, and the count of events removed.
   */
  getPurgeAuditLog(): PurgeAuditRecord[] {
    const auditKey = this.config.auditStorageKey ?? DEFAULT_AUDIT_KEY
    return readAuditRecords(this.storage, auditKey)
  }

  private hashIdentifier(value: string): string {
    // Simple deterministic hash for audit purposes. Not cryptographic —
    // the goal is an opaque, stable identifier, not collision resistance.
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i)
      hash = ((hash << 5) - hash + char) | 0
    }
    return `hash_${(hash >>> 0).toString(36)}`
  }

  private enqueue(eventName: string, properties: Record<string, unknown>): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: this.newId('event'),
      name: eventName,
      timestamp: this.now().toISOString(),
      anonymousId: this.state.anonymousId,
      sessionId: this.state.sessionId,
      ...(this.state.userId ? { userId: this.state.userId } : {}),
      properties: sanitizeProperties(
        eventName,
        properties,
        this.config.privacy?.allowSensitiveProperties === true,
      ),
    }

    this.state.queue.push(event)
    this.persist()
    if (this.state.queue.length >= this.batchSize) {
      void this.flush().catch((error: unknown) => this.reportError(error))
    }
    return event
  }

  private async flushQueue(): Promise<void> {
    while (this.state.queue.length > 0) {
      const events = this.state.queue.slice(0, this.batchSize)
      const eventIds = new Set(events.map((event) => event.id))
      const batch: AnalyticsBatch = {
        schemaVersion: 1,
        batchId: `batch_${events.map((event) => event.id).join('_')}`,
        sentAt: this.now().toISOString(),
        events,
      }

      await this.config.transport(batch)
      this.state.queue = this.state.queue.filter((event) => !eventIds.has(event.id))
      this.persist()
    }
  }

  private readPersistedState(): PersistedAnalyticsState | undefined {
    try {
      return readState(this.storage, this.storageKey)
    } catch (error) {
      this.reportError(error)
      return undefined
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.state))
    } catch (error) {
      this.reportError(error)
    }
  }

  private now(): Date {
    return this.config.now?.() ?? new Date()
  }

  private newId(prefix: string): string {
    const value = this.config.generateId?.() ?? randomId()
    return `${prefix}_${value}`
  }

  private reportError(error: unknown): void {
    this.config.onError?.(error)
  }
}
