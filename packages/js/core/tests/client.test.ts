import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EchoMirrorClient,
  EchoMirrorError,
  AuthError,
  NetworkError,
  RateLimitError,
  LoggingMiddleware,
  MAX_MIDDLEWARE_RETRIES,
} from '../src'
import type { RequestMiddleware, MiddlewareRequest, MiddlewareOutcome } from '../src'

describe('EchoMirrorClient unit tests', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    globalThis.fetch = originalFetch
  })

  describe('Configuration & Request Construction', () => {
    it('uses sensible default configuration', () => {
      const client = new EchoMirrorClient({ apiKey: 'test-api-key' })

      expect(client.config).toEqual({
        apiKey: 'test-api-key',
        baseUrl: 'https://api.echomirror.dev/v1',
        network: 'mainnet',
        timeout: 10_000,
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 5_000,
      })
    })

    it('accepts custom configuration overrides', () => {
      const client = new EchoMirrorClient({
        apiKey: 'custom-key',
        baseUrl: 'https://custom.echomirror.dev/v2',
        network: 'testnet',
        timeout: 2500,
        retry: {
          maxRetries: 5,
          baseDelayMs: 200,
          maxDelayMs: 10_000,
        },
      })

      expect(client.config.apiKey).toBe('custom-key')
      expect(client.config.baseUrl).toBe('https://custom.echomirror.dev/v2')
      expect(client.config.network).toBe('testnet')
      expect(client.config.timeout).toBe(2500)
      expect(client.config.maxRetries).toBe(5)
      expect(client.config.baseDelayMs).toBe(200)
      expect(client.config.maxDelayMs).toBe(10_000)
    })

    it('constructs correct URL, headers, and method for GET requests', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({ apiKey: 'my-key', network: 'testnet' })
      const data = await client.request('GET', '/users/me')

      expect(data).toEqual({ ok: true })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('https://api.echomirror.dev/v1/users/me', {
        method: 'GET',
        headers: {
          'x-api-key': 'my-key',
          'x-echomirror-network': 'testnet',
        },
        body: undefined,
        signal: expect.any(AbortSignal),
      })
    })

    it('attaches json content-type and serializes request body for POST', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: '123' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({ apiKey: 'my-key' })
      const payload = { score: 8, note: 'feeling energized' }
      const res = await client.request('POST', '/mood/entries', payload)

      expect(res).toEqual({ id: '123' })
      expect(fetchMock).toHaveBeenCalledWith('https://api.echomirror.dev/v1/mood/entries', {
        method: 'POST',
        headers: {
          'x-api-key': 'my-key',
          'x-echomirror-network': 'mainnet',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: expect.any(AbortSignal),
      })
    })

    it('attaches and clears authorization token', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ user: 'authenticated' }), { status: 200 })),
      )
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({ apiKey: 'my-key' })
      client.setAuthToken('token-abc-123')

      await client.request('GET', '/profile')
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://api.echomirror.dev/v1/profile',
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer token-abc-123',
          }),
        }),
      )

      client.setAuthToken(null)
      await client.request('GET', '/profile')
      const secondCallHeaders = fetchMock.mock.calls[1][1].headers
      expect(secondCallHeaders.authorization).toBeUndefined()
    })

    it('handles 204 No Content responses as undefined', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 204 })),
      )

      const client = new EchoMirrorClient({ apiKey: 'my-key' })
      const result = await client.request('DELETE', '/mood/entries/123')
      expect(result).toBeUndefined()
    })

    it('handles non-JSON response bodies as text', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Plain text response', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      )

      const client = new EchoMirrorClient({ apiKey: 'my-key' })
      const result = await client.request('GET', '/health')
      expect(result).toBe('Plain text response')
    })
  })

  describe('Error Mapping', () => {
    it('maps 401 status to AuthError', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
      )

      const client = new EchoMirrorClient({ apiKey: 'invalid-key', retry: { maxRetries: 0 } })
      await expect(client.request('GET', '/test')).rejects.toThrow(AuthError)
      await expect(client.request('GET', '/test')).rejects.toMatchObject({
        name: 'AuthError',
        statusCode: 401,
        message: 'Invalid or expired API key',
      })
    })

    it('maps 429 status to RateLimitError with retry-after header', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
          headers: { 'retry-after': '45' },
        }),
      )

      const client = new EchoMirrorClient({ apiKey: 'test-key', retry: { maxRetries: 0 } })
      try {
        await client.request('GET', '/test')
        expect.unreachable('Should have thrown RateLimitError')
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError)
        expect((err as RateLimitError).retryAfterSeconds).toBe(45)
        expect((err as RateLimitError).statusCode).toBe(429)
        expect((err as RateLimitError).name).toBe('RateLimitError')
      }
    })

    it('defaults RateLimitError retry-after to 60 if header is absent', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }),
      )

      const client = new EchoMirrorClient({ apiKey: 'test-key', retry: { maxRetries: 0 } })
      try {
        await client.request('GET', '/test')
        expect.unreachable('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError)
        expect((err as RateLimitError).retryAfterSeconds).toBe(60)
      }
    })

    it('maps generic fetch network failures to NetworkError', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

      const client = new EchoMirrorClient({ apiKey: 'test-key', retry: { maxRetries: 0 } })
      await expect(client.request('GET', '/test')).rejects.toThrow(NetworkError)
      await expect(client.request('GET', '/test')).rejects.toMatchObject({
        name: 'NetworkError',
        message: 'Network error: Failed to fetch',
      })
    })

    it('maps other HTTP error statuses to EchoMirrorError with body message', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Resource not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      )

      const client = new EchoMirrorClient({ apiKey: 'test-key', retry: { maxRetries: 0 } })
      try {
        await client.request('GET', '/missing')
        expect.unreachable('Should have thrown EchoMirrorError')
      } catch (err) {
        expect(err).toBeInstanceOf(EchoMirrorError)
        expect((err as EchoMirrorError).message).toBe('Resource not found')
        expect((err as EchoMirrorError).statusCode).toBe(404)
        expect((err as EchoMirrorError).name).toBe('EchoMirrorError')
      }
    })

    it('maps HTTP error with fallback message when body message is missing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Internal Server Error', { status: 502 }),
      )

      const client = new EchoMirrorClient({ apiKey: 'test-key', retry: { maxRetries: 0 } })
      await expect(client.request('GET', '/failing')).rejects.toMatchObject({
        message: 'HTTP 502',
        statusCode: 502,
      })
    })
  })

  describe('Retry & Backoff Logic', () => {
    it('retries transient 5xx errors up to maxRetries', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Service Unavailable' }), { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Gateway Timeout' }), { status: 504 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: 'success!' }), { status: 200 }))
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({
        apiKey: 'test-key',
        retry: { maxRetries: 2, baseDelayMs: 50, maxDelayMs: 200 },
      })

      const promise = client.request<{ data: string }>('GET', '/status')

      // Advance timers through retry delays
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toEqual({ data: 'success!' })
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('throws when maxRetries is exceeded on retryable errors', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Server error' }), { status: 500 }),
        ),
      )
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({
        apiKey: 'test-key',
        retry: { maxRetries: 2, baseDelayMs: 20 },
      })

      let caught: unknown
      const promise = client.request('GET', '/error').catch((err) => {
        caught = err
      })

      await vi.runAllTimersAsync()
      await promise

      expect(caught).toMatchObject({
        statusCode: 500,
        message: 'Server error',
      })
      expect(fetchMock).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
    })

    it('does not retry non-retryable client errors (e.g. 400 or 401)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Bad request payload' }), { status: 400 }),
      )
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({
        apiKey: 'test-key',
        retry: { maxRetries: 3 },
      })

      await expect(client.request('POST', '/bad', {})).rejects.toMatchObject({
        statusCode: 400,
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('honors retryAfterSeconds on rate limit retries', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'rate limited' }), {
            status: 429,
            headers: { 'retry-after': '2' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: 'recovered' }), { status: 200 }),
        )
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({
        apiKey: 'test-key',
        retry: { maxRetries: 1, baseDelayMs: 50 },
      })

      const promise = client.request('GET', '/throttled')
      await vi.runAllTimersAsync()
      const res = await promise

      expect(res).toEqual({ data: 'recovered' })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('retries NetworkError on connection drop', async () => {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new TypeError('Connection reset'))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({
        apiKey: 'test-key',
        retry: { maxRetries: 1, baseDelayMs: 10 },
      })

      const promise = client.request('GET', '/flaky')
      await vi.runAllTimersAsync()
      const res = await promise

      expect(res).toEqual({ status: 'ok' })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('Request Timeout Behavior', () => {
    it('aborts slow request and maps to NetworkError with timeout message', async () => {
      const client = new EchoMirrorClient({
        apiKey: 'test-key',
        timeout: 500,
        retry: { maxRetries: 0 },
      })

      globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted')
              abortErr.name = 'AbortError'
              reject(abortErr)
            })
          }
        })
      })

      const promise = client.request('GET', '/slow')
      const assertion = expect(promise).rejects.toThrow('Request timed out after 500ms')

      await vi.advanceTimersByTimeAsync(500)
      await assertion
    })
  })

  describe('Middleware Pipeline', () => {
    it('invokes beforeRequest hook and allows modifying headers', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      const mw: RequestMiddleware = {
        beforeRequest: (_c, req) => {
          req.headers['x-custom-trace'] = 'trace-999'
        },
      }

      client.use(mw)
      await client.request('GET', '/test')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-custom-trace': 'trace-999',
          }),
        }),
      )
    })

    it('can remove registered middleware', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )
      globalThis.fetch = fetchMock

      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      const mw: RequestMiddleware = {
        beforeRequest: (_c, req) => {
          req.headers['x-unwanted'] = 'should-not-exist'
        },
      }

      client.use(mw)
      client.removeMiddleware(mw)
      await client.request('GET', '/test')

      const headers = fetchMock.mock.calls[0][1].headers
      expect(headers['x-unwanted']).toBeUndefined()
    })

    it('supports afterResponse returning continue on successful response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: 'hello' }), { status: 200 }),
      )

      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      let capturedStatus = 0

      client.use({
        afterResponse: (_c, _req, outcome) => {
          if (outcome.type === 'response') {
            capturedStatus = outcome.status
          }
          return 'continue'
        },
      })

      const res = await client.request('GET', '/test')
      expect(res).toEqual({ data: 'hello' })
      expect(capturedStatus).toBe(200)
    })

    it('supports afterResponse returning retry-now to retry immediately', async () => {
      let callCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'token_expired' }), { status: 401 })
        }
        return new Response(JSON.stringify({ refreshed: true }), { status: 200 })
      })

      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      client.use({
        afterResponse: (c, _req, outcome) => {
          if (outcome.type === 'response' && outcome.status === 401) {
            c.setAuthToken('new-token')
            return 'retry-now'
          }
          return 'continue'
        },
      })

      const res = await client.request('GET', '/auth-test')
      expect(res).toEqual({ refreshed: true })
      expect(callCount).toBe(2)
    })

    it('throws EchoMirrorError when middleware retries exceed MAX_MIDDLEWARE_RETRIES', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'always retry' }), { status: 400 }),
      )

      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      client.use({
        afterResponse: () => 'retry-now',
      })

      await expect(client.request('GET', '/loop')).rejects.toThrow(
        'middleware requested a retry too many times',
      )
    })

    it('handles afterResponse when network error occurs', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network offline'))

      let capturedError: Error | null = null
      const client = new EchoMirrorClient({ apiKey: 'test-key', retry: { maxRetries: 0 } })
      client.use({
        afterResponse: (_c, _req, outcome) => {
          if (outcome.type === 'error') {
            capturedError = outcome.error
          }
          return 'continue'
        },
      })

      await expect(client.request('GET', '/test')).rejects.toThrow(NetworkError)
      expect(capturedError).toBeInstanceOf(NetworkError)
    })

    it('supports afterResponse returning retry-now on network error', async () => {
      let attempts = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts === 1) {
          throw new TypeError('Socket closed')
        }
        return new Response(JSON.stringify({ reconnected: true }), { status: 200 })
      })

      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      client.use({
        afterResponse: (_c, _req, outcome) => {
          if (outcome.type === 'error') {
            return 'retry-now'
          }
          return 'continue'
        },
      })

      const res = await client.request('GET', '/reconnect')
      expect(res).toEqual({ reconnected: true })
      expect(attempts).toBe(2)
    })

    it('supports LoggingMiddleware without crashing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      client.use(new LoggingMiddleware('test-logger'))

      await client.request('GET', '/ping')

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[test-logger] → GET https://api.echomirror.dev/v1/ping'),
      )
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[test-logger] ← GET https://api.echomirror.dev/v1/ping 200'),
      )
    })

    it('LoggingMiddleware logs warnings on error outcomes', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(console, 'debug').mockImplementation(() => {})

      const client = new EchoMirrorClient({ apiKey: 'test-key', retry: { maxRetries: 0 } })
      client.use(new LoggingMiddleware('test-logger'))

      await expect(client.request('GET', '/fail')).rejects.toThrow(NetworkError)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[test-logger] ✗ GET https://api.echomirror.dev/v1/fail'),
      )
    })
  })

  describe('Middleware helpers', () => {
    it('sleep helper waits for the specified duration', async () => {
      const { sleep } = await import('../src/middleware')
      let done = false
      const promise = sleep(150).then(() => {
        done = true
      })
      expect(done).toBe(false)
      await vi.advanceTimersByTimeAsync(150)
      await promise
      expect(done).toBe(true)
    })
  })

  describe('Event Bus (client.on, client.off, client.emit)', () => {
    it('subscribes, receives events, and unsubscribes via returned function', () => {
      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      const handler = vi.fn()

      const unsubscribe = client.on('mood:logged' as any, handler)

      const mockEvent = {
        type: 'mood:logged',
        entry: { id: 'entry-1', score: 9 },
      }
      client.emit(mockEvent as any)
      expect(handler).toHaveBeenCalledWith(mockEvent)
      expect(handler).toHaveBeenCalledTimes(1)

      unsubscribe()
      client.emit(mockEvent as any)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('unsubscribes cleanly via client.off', () => {
      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      const handler = vi.fn()

      client.on('custom:event' as any, handler)
      client.off('custom:event' as any, handler)

      client.emit({ type: 'custom:event' } as any)
      expect(handler).not.toHaveBeenCalled()
    })

    it('does not throw when emitting an event with no listeners', () => {
      const client = new EchoMirrorClient({ apiKey: 'test-key' })
      expect(() => client.emit({ type: 'unhandled:event' } as any)).not.toThrow()
    })
  })

  describe('Error Classes', () => {
    it('instantiates all error types with correct status codes and defaults', () => {
      const baseErr = new EchoMirrorError('Base message', 418)
      expect(baseErr.message).toBe('Base message')
      expect(baseErr.statusCode).toBe(418)
      expect(baseErr.name).toBe('EchoMirrorError')

      const authErr = new AuthError()
      expect(authErr.message).toBe('Authentication failed')
      expect(authErr.statusCode).toBe(401)
      expect(authErr.name).toBe('AuthError')

      const netErr = new NetworkError()
      expect(netErr.message).toBe('Network request failed')
      expect(netErr.name).toBe('NetworkError')

      const rateErr = new RateLimitError(30)
      expect(rateErr.retryAfterSeconds).toBe(30)
      expect(rateErr.statusCode).toBe(429)
      expect(rateErr.name).toBe('RateLimitError')
    })
  })
})
