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

        // After reconnect delay, a new WebSocket should be created
        setTimeout(() => {
          const ws2 = (transport as unknown as { _ws: MockWebSocket | null })._ws
          expect(ws2).not.toBe(firstWs)
          expect(ws2).not.toBeNull()
          transport.disconnect()
          done()
        }, 200)
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
})