import { resolveStorage } from './storage'
import type { AnalyticsStorage } from './storage'
import { sanitizeProperties } from './privacy'
import { IdentityManager } from './identity'
import { PersistentQueue } from './queue'
import { webhookTransport } from './adapters'
import type {
  AnalyticsConfig,
  AnalyticsEvent,
  AnalyticsProperties,
  DomainEventMap,
  DomainEventName,
  PrivacyMode,
  Transport,
} from './types'

type TrackProperties<N extends string> = N extends DomainEventName
  ? DomainEventMap[N]
  : AnalyticsProperties

const DEFAULT_FLUSH_AT = 20
const DEFAULT_FLUSH_INTERVAL_MS = 30_000
const DEFAULT_STORAGE_KEY = 'echomirror.analytics'
const IDENTIFY_EVENT = '$identify'

function defaultGenerateId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const rand = Math.floor(Math.random() * 1e9).toString(36)
  return `em-${Date.now().toString(36)}-${rand}`
}

function noopTransport(): Transport {
  return async () => undefined
}

export class Analytics {
  private transport: Transport
  private storage: AnalyticsStorage
  private queue: PersistentQueue
  private identity: IdentityManager
  private privacyMode: PrivacyMode
  private flushAt: number
  private flushIntervalMs: number
  private now: () => number
  private generateId: () => string
  private timer: ReturnType<typeof setInterval> | null = null
  private inflight: Promise<void> | null = null

  constructor(config: AnalyticsConfig = {}) {
    this.storage = resolveStorage(config.storage)
    this.privacyMode = config.privacyMode ?? 'strict'
    this.flushAt = config.flushAt ?? DEFAULT_FLUSH_AT
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
    this.now = config.now ?? (() => Date.now())
    this.generateId = config.generateId ?? defaultGenerateId

    const storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY
    this.queue = new PersistentQueue(this.storage, `${storageKey}:queue`)
    this.identity = new IdentityManager(this.storage, storageKey, this.generateId)

    if (config.transport) {
      this.transport = config.transport
    } else if (config.endpoint) {
      this.transport = webhookTransport(config.endpoint, config.fetch)
    } else {
      this.transport = noopTransport()
    }

    const autoFlush = config.autoFlush ?? true
    if (autoFlush && this.flushIntervalMs > 0) this.start()
  }

  get anonymousId(): string {
    return this.identity.anonymousId
  }

  get userId(): string | null {
    return this.identity.userId
  }

  get sessionId(): string {
    return this.identity.sessionId
  }

  async track<N extends string>(
    event: N,
    properties?: TrackProperties<N>,
  ): Promise<void> {
    const raw = (properties ?? {}) as AnalyticsProperties
    const snapshot = this.identity.snapshot()
    const analyticsEvent: AnalyticsEvent = {
      messageId: this.generateId(),
      event,
      properties: sanitizeProperties(raw, this.privacyMode),
      anonymousId: snapshot.anonymousId,
      userId: snapshot.userId,
      sessionId: snapshot.sessionId,
      timestamp: new Date(this.now()).toISOString(),
    }
    this.queue.enqueue(analyticsEvent)
    if (this.queue.size() >= this.flushAt) {
      await this.flush().catch(() => undefined)
    }
  }

  identify(userId: string): void {
    const { previousAnonymousId } = this.identity.identify(userId)
    this.queue.applyUserId(userId)
    const snapshot = this.identity.snapshot()
    this.queue.enqueue({
      messageId: this.generateId(),
      event: IDENTIFY_EVENT,
      properties: { previousAnonymousId },
      anonymousId: snapshot.anonymousId,
      userId,
      sessionId: snapshot.sessionId,
      timestamp: new Date(this.now()).toISOString(),
    })
  }

  reset(): void {
    this.identity.reset()
  }

  pending(): AnalyticsEvent[] {
    return this.queue.all()
  }

  async flush(): Promise<void> {
    if (this.inflight) return this.inflight
    this.inflight = this.performFlush().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async performFlush(): Promise<void> {
    const batch = this.queue.all()
    if (batch.length === 0) return
    await this.transport(batch)
    this.queue.remove(batch.map((event) => event.messageId))
  }

  start(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => {
      void this.flush().catch(() => undefined)
    }, this.flushIntervalMs)
    const handle = this.timer as { unref?: () => void }
    if (typeof handle.unref === 'function') handle.unref()
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
