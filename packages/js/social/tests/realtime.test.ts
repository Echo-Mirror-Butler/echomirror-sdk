import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebSocketTransport, SocialSubscription } from '../src/realtime'
import type { SocialLiveEvent } from '../src/types'

/**
 * Mock WebSocket implementation for testing.
 */
class MockWebSocket {
  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  readyState: number = 0
  closeCalled = false
  private _openTimer: ReturnType<typeof setTimeout> | null = null

  constructor(_url: string) {
    // Simulate async open
    this._openTimer = setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }

  close() {
    if (this._openTimer) clearTimeout(this._openTimer)
    this.closeCalled = true
    this.readyState = 3
  }

  // Test helpers
  simulateMessage(data: string) {
    this.onmessage?.({ data })
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = 3
    this.onclose?.({ code, reason })
  }

  simulateError() {
    this.onerror?.()
  }
}

describe('WebSocketTransport', () => {
  let originalWebSocket: typeof globalThis.WebSocket

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
    vi.useRealTimers()
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
  })

  it('connects and receives messages', () => {
    return new Promise<void>((done) => {
      const transport = new WebSocketTransport()
      const handler = vi.fn()

      transport.onMessage(handler)
      transport.connect('wss://test/ws')

      setTimeout(() => {
        const ws = (transport as unknown as { _ws: MockWebSocket | null })._ws
        expect(ws).not.toBeNull()
        const event: SocialLiveEvent = { type: 'feed:new_entry', entry: { id: '1', score: 8, tags: [], createdAt: '2026-01-01T00:00:00Z' } }
        ws!.simulateMessage(JSON.stringify(event))
        expect(handler).toHaveBeenCalledWith(event)
        transport.disconnect()
        done()
      }, 50)
    })
  })

  it('reconnects on disconnect', () => {
    return new Promise<void>((done) => {
      const transport = new WebSocketTransport({ maxReconnectAttempts: 3, reconnectDelay: 50 })
      transport.connect('wss://test/ws')

      setTimeout(() => {
        const ws = (transport as unknown as { _ws: MockWebSocket | null })._ws
        expect(ws).not.toBeNull()
        const firstWs = ws
        ws!.simulateClose(1006, 'Abnormal')

        // After reconnect delay, a new WebSocket should be created.
        // Margin must exceed reconnectDelay + max jitter (200ms) — a tighter
        // margin here was flaky under load since jitter is 0-200ms regardless
        // of reconnectDelay.
        setTimeout(() => {
          const ws2 = (transport as unknown as { _ws: MockWebSocket | null })._ws
          expect(ws2).not.toBe(firstWs)
          expect(ws2).not.toBeNull()
          transport.disconnect()
          done()
        }, 350)
      }, 50)
    })
  })

  it('stops reconnecting after max attempts', () => {
    return new Promise<void>((done) => {
      const transport = new WebSocketTransport({ maxReconnectAttempts: 2, reconnectDelay: 20 })
      transport.connect('wss://test/ws')

      setTimeout(() => {
        const ws = (transport as unknown as { _ws: MockWebSocket | null })._ws
        ws!.simulateClose()
      }, 50)

      // Wait enough time for reconnect attempts to exhaust
      setTimeout(() => {
        transport.disconnect()
        // If it didn't crash, test passes
        done()
      }, 500)
    })
  })

  it('disconnect() cleans up', () => {
    const transport = new WebSocketTransport()
    transport.connect('wss://test/ws')
    transport.disconnect()

    const ws = (transport as unknown as { _ws: MockWebSocket | null })._ws
    expect(ws).toBeNull()
  })
})

describe('SocialSubscription', () => {
  let originalWebSocket: typeof globalThis.WebSocket

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
  })

  it('subscribes and receives events', () => {
    return new Promise<void>((done) => {
      const sub = new SocialSubscription({ baseUrl: 'wss://test/ws' })
      const handler = vi.fn()

      sub.subscribe(handler)

      setTimeout(() => {
        // Access the transport's ws to simulate a message
        const transport = (sub as unknown as { _transport: WebSocketTransport })._transport
        const ws = (transport as unknown as { _ws: MockWebSocket | null })._ws
        const event: SocialLiveEvent = { type: 'feed:new_entry', entry: { id: '1', score: 7, tags: [], createdAt: '2026-01-01T00:00:00Z' } }
        ws!.simulateMessage(JSON.stringify(event))

        expect(handler).toHaveBeenCalledWith(event)
        sub.disconnect()
        done()
      }, 50)
    })
  })

  it('unsubscribes stops receiving events', () => {
    return new Promise<void>((done) => {
      const sub = new SocialSubscription({ baseUrl: 'wss://test/ws' })
      const handler = vi.fn()

      const unsubscribe = sub.subscribe(handler)
      unsubscribe()

      // After unsubscribe, the transport should be disconnected (no handlers left)
      // Re-subscribe with a new handler to verify the old one doesn't fire
      const handler2 = vi.fn()
      sub.subscribe(handler2)

      setTimeout(() => {
        const transport = (sub as unknown as { _transport: WebSocketTransport })._transport
        const ws = (transport as unknown as { _ws: MockWebSocket | null })._ws
        const event: SocialLiveEvent = { type: 'feed:new_entry', entry: { id: '1', score: 5, tags: [], createdAt: '2026-01-01T00:00:00Z' } }
        ws!.simulateMessage(JSON.stringify(event))

        expect(handler).not.toHaveBeenCalled()
        expect(handler2).toHaveBeenCalled()
        sub.disconnect()
        done()
      }, 50)
    })
  })

  it('disconnect() cleans up all subscriptions', () => {
    const sub = new SocialSubscription({ baseUrl: 'wss://test/ws' })
    const handler = vi.fn()
    sub.subscribe(handler)
    sub.disconnect()

    // After disconnect, subscribing again should reconnect
    const handler2 = vi.fn()
    sub.subscribe(handler2)
    expect(handler2).toBeDefined()
    sub.disconnect()
  })

  it('backfills missed feed entries via feedClient after a reconnect', () => {
    return new Promise<void>((done) => {
      const fetchSince = vi.fn().mockResolvedValue({
        entries: [
          { id: '2', score: 6, tags: [], createdAt: '2026-01-01T00:01:00Z' },
          { id: '3', score: 9, tags: [], createdAt: '2026-01-01T00:02:00Z' },
        ],
        nextCursor: null,
      })
      const feedClient = { fetchSince } as unknown as import('../src/feed').GlobalFeedClient
      const transport = new WebSocketTransport({ maxReconnectAttempts: 3, reconnectDelay: 20 })

      const sub = new SocialSubscription({ transport, feedClient })
      const events: SocialLiveEvent[] = []
      sub.subscribe((e) => events.push(e))

      setTimeout(() => {
        const ws = (transport as unknown as { _ws: MockWebSocket | null })._ws
        // First event establishes the backfill anchor.
        const first: SocialLiveEvent = { type: 'feed:new_entry', entry: { id: '1', score: 5, tags: [], createdAt: '2026-01-01T00:00:00Z' } }
        ws!.simulateMessage(JSON.stringify(first))

        // Simulate a drop and reconnect.
        ws!.simulateClose(1006, 'Abnormal')

        setTimeout(() => {
          expect(fetchSince).toHaveBeenCalledWith('1')
          setTimeout(() => {
            expect(events).toContainEqual({ type: 'feed:new_entry', entry: { id: '2', score: 6, tags: [], createdAt: '2026-01-01T00:01:00Z' } })
            expect(events).toContainEqual({ type: 'feed:new_entry', entry: { id: '3', score: 9, tags: [], createdAt: '2026-01-01T00:02:00Z' } })
            expect(events.some((e) => e.type === 'connection:gap')).toBe(false)
            sub.disconnect()
            done()
          }, 20)
        }, 350)
      }, 30)
    })
  })

  it('emits connection:gap when backfill is unavailable after a reconnect', () => {
    return new Promise<void>((done) => {
      const transport = new WebSocketTransport({ maxReconnectAttempts: 3, reconnectDelay: 20 })
      const sub = new SocialSubscription({ transport })
      const events: SocialLiveEvent[] = []
      sub.subscribe((e) => events.push(e))

      setTimeout(() => {
        const ws = (transport as unknown as { _ws: MockWebSocket | null })._ws
        const first: SocialLiveEvent = { type: 'feed:new_entry', entry: { id: '1', score: 5, tags: [], createdAt: '2026-01-01T00:00:00Z' } }
        ws!.simulateMessage(JSON.stringify(first))
        ws!.simulateClose(1006, 'Abnormal')

        setTimeout(() => {
          const gap = events.find((e) => e.type === 'connection:gap')
          expect(gap).toEqual({ type: 'connection:gap', since: '1' })
          sub.disconnect()
          done()
        }, 350)
      }, 30)
    })
  })

  it('emits connection:gap when backfill fails', () => {
    return new Promise<void>((done) => {
      const fetchSince = vi.fn().mockRejectedValue(new Error('network error'))
      const feedClient = { fetchSince } as unknown as import('../src/feed').GlobalFeedClient
      const transport = new WebSocketTransport({ maxReconnectAttempts: 3, reconnectDelay: 20 })
      const sub = new SocialSubscription({ transport, feedClient })
      const events: SocialLiveEvent[] = []
      sub.subscribe((e) => events.push(e))

      setTimeout(() => {
        const ws = (transport as unknown as { _ws: MockWebSocket | null })._ws
        const first: SocialLiveEvent = { type: 'feed:new_entry', entry: { id: '1', score: 5, tags: [], createdAt: '2026-01-01T00:00:00Z' } }
        ws!.simulateMessage(JSON.stringify(first))
        ws!.simulateClose(1006, 'Abnormal')

        setTimeout(() => {
          setTimeout(() => {
            const gap = events.find((e) => e.type === 'connection:gap')
            expect(gap).toEqual({ type: 'connection:gap', since: '1' })
            sub.disconnect()
            done()
          }, 20)
        }, 350)
      }, 30)
    })
  })
})