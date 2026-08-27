import type { GlobalFeedClient } from './feed'
import type { SocialLiveEvent } from './types'

/**
 * RealtimeTransport abstracts the underlying push mechanism so the rest of
 * the code doesn't care whether it's WebSocket or SSE.
 *
 * To add SSE support later, implement this interface with an EventSource-based
 * transport and swap it in.
 */
export interface RealtimeTransport {
  connect(url: string): void
  disconnect(): void
  onMessage(handler: (event: SocialLiveEvent) => void): void
  /**
   * Optional: called every time the transport establishes an open
   * connection. `isReconnect` is `true` when this is not the first open for
   * the current `connect()` call — i.e. the connection dropped and came back,
   * which is exactly when events may have been missed. Transports that can't
   * distinguish first-open from reconnect may omit this; callers then have
   * no way to detect gaps for that transport.
   */
  onOpen?(handler: (info: { isReconnect: boolean }) => void): void
}

/**
 * WebSocket-based transport for real-time social updates.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ASSUMPTION — NOT CONFIRMED                                    ║
 * ║                                                                  ║
 * ║  This transport assumes WebSocket at:                           ║
 * ║    wss://api.echomirror.dev/v1/social/ws                        ║
 * ║                                                                  ║
 * ║  The actual EchoMirror backend may use SSE instead, or a        ║
 * ║  different WebSocket URL/path. The RealtimeTransport interface  ║
 * ║  exists so switching to SSE requires only a new implementation  ║
 * ║  and a one-line swap in SocialSubscription.                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
export class WebSocketTransport implements RealtimeTransport {
  private _ws: WebSocket | null = null
  private _url: string = ''
  private _handler: ((event: SocialLiveEvent) => void) | null = null
  private _openHandler: ((info: { isReconnect: boolean }) => void) | null = null
  private _hasOpenedOnce = false
  private _reconnectAttempts = 0
  private _maxReconnectAttempts: number
  private _reconnectDelay: number
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _disposed = false

  constructor(options?: { maxReconnectAttempts?: number; reconnectDelay?: number }) {
    this._maxReconnectAttempts = options?.maxReconnectAttempts ?? 10
    this._reconnectDelay = options?.reconnectDelay ?? 1_000
  }

  connect(url: string): void {
    this._url = url
    this._disposed = false
    this._hasOpenedOnce = false
    this._openConnection()
  }

  disconnect(): void {
    this._disposed = true
    this._clearReconnectTimer()
    this._ws?.close()
    this._ws = null
  }

  onMessage(handler: (event: SocialLiveEvent) => void): void {
    this._handler = handler
  }

  onOpen(handler: (info: { isReconnect: boolean }) => void): void {
    this._openHandler = handler
  }

  private _openConnection(): void {
    if (this._disposed) return

    try {
      this._ws = new WebSocket(this._url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this._ws.onopen = () => {
      this._reconnectAttempts = 0
      this._openHandler?.({ isReconnect: this._hasOpenedOnce })
      this._hasOpenedOnce = true
    }

    this._ws.onmessage = (msg: MessageEvent) => {
      try {
        const event = JSON.parse(msg.data) as SocialLiveEvent
        this._handler?.(event)
      } catch {
        // Silently drop malformed messages
      }
    }

    this._ws.onclose = () => {
      if (!this._disposed) {
        this._scheduleReconnect()
      }
    }

    this._ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    }
  }

  private _scheduleReconnect(): void {
    if (this._disposed) return
    if (this._reconnectAttempts >= this._maxReconnectAttempts) return

    this._reconnectAttempts++
    const delay = this._reconnectDelay * Math.min(this._reconnectAttempts, 5)
    const jitter = Math.random() * 200

    this._reconnectTimer = setTimeout(() => {
      this._openConnection()
    }, delay + jitter)
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }
}

/**
 * Subscription manager for real-time social updates.
 *
 * Consumers subscribe via `subscribe(callback)` and get a cleanup function.
 * The manager wraps a `RealtimeTransport` so the feed/leaderboard hooks
 * don't need to know about WebSocket or SSE details.
 */
export class SocialSubscription {
  private _transport: RealtimeTransport
  private _handlers = new Set<(event: SocialLiveEvent) => void>()
  private _connected = false
  private _url: string
  private _feedClient: GlobalFeedClient | undefined
  private _lastFeedEntryId: string | null = null

  /**
   * @param options.baseUrl    API base URL. Defaults to 'wss://api.echomirror.dev/v1'
   *                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   *                           ASSUMPTION — NOT CONFIRMED (see WebSocketTransport docs)
   * @param options.transport  RealtimeTransport implementation. Defaults to WebSocketTransport.
   * @param options.feedClient When provided, a reconnect after a genuine disconnect
   *                           (not the initial connect) triggers `feedClient.fetchSince()`
   *                           to backfill any `feed:new_entry` events missed while down.
   *                           If omitted, or the backfill request fails, subscribers get
   *                           a `connection:gap` event instead so they know to treat their
   *                           state as possibly stale.
   */
  constructor(options?: {
    baseUrl?: string
    transport?: RealtimeTransport
    feedClient?: GlobalFeedClient
  }) {
    // ASSUMPTION — NOT CONFIRMED: path /social/ws and protocol wss://
    this._url = options?.baseUrl ?? 'wss://api.echomirror.dev/v1/social/ws'
    this._transport = options?.transport ?? new WebSocketTransport()
    this._feedClient = options?.feedClient

    this._transport.onMessage((event) => {
      if (event.type === 'feed:new_entry') {
        this._lastFeedEntryId = event.entry.id
      }
      this._emit(event)
    })

    this._transport.onOpen?.(({ isReconnect }) => {
      if (isReconnect) {
        void this._handleReconnect()
      }
    })
  }

  /**
   * Subscribe to real-time social events.
   * Returns an unsubscribe function.
   */
  subscribe(handler: (event: SocialLiveEvent) => void): () => void {
    this._handlers.add(handler)

    if (!this._connected) {
      this._transport.connect(this._url)
      this._connected = true
    }

    return () => {
      this._handlers.delete(handler)
      if (this._handlers.size === 0) {
        this._transport.disconnect()
        this._connected = false
      }
    }
  }

  /**
   * Manually disconnect the transport. All subscriptions will stop
   * receiving events until a new `subscribe()` call reconnects.
   */
  disconnect(): void {
    this._transport.disconnect()
    this._connected = false
    this._handlers.clear()
  }

  private _emit(event: SocialLiveEvent): void {
    for (const handler of this._handlers) {
      handler(event)
    }
  }

  /**
   * Runs after a reconnect (as opposed to the initial connect). Tries to
   * backfill missed `feed:new_entry` events via `feedClient.fetchSince()`;
   * falls back to an explicit `connection:gap` event when backfill isn't
   * configured, has no anchor to backfill from, or fails.
   */
  private async _handleReconnect(): Promise<void> {
    if (!this._feedClient || !this._lastFeedEntryId) {
      this._emit({ type: 'connection:gap', since: this._lastFeedEntryId })
      return
    }

    try {
      const { entries } = await this._feedClient.fetchSince(this._lastFeedEntryId)
      for (const entry of entries) {
        this._lastFeedEntryId = entry.id
        this._emit({ type: 'feed:new_entry', entry })
      }
    } catch {
      this._emit({ type: 'connection:gap', since: this._lastFeedEntryId })
    }
  }
}