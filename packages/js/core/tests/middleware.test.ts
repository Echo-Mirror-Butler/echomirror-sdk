import { afterEach, describe, expect, it, vi } from 'vitest'
import { EchoMirrorClient } from '../src/client'
import type { RequestMiddleware } from '../src/middleware'

afterEach(() => {
  vi.unstubAllGlobals()
})

function clientWith(middleware: RequestMiddleware, maxRetries = 1) {
  return new EchoMirrorClient({
    apiKey: 'test-key',
    baseUrl: 'https://api.example.test',
    retry: { maxRetries, baseDelayMs: 0, maxDelayMs: 0 },
  }).use(middleware)
}

describe('EchoMirrorClient middleware', () => {
  it('runs hooks once per network retry and forwards request mutations', async () => {
    const beforeAttempts: number[] = []
    const afterStatuses: number[] = []
    const middleware: RequestMiddleware = {
      beforeRequest(_client, request) {
        beforeAttempts.push(request.attempt)
        request.headers['x-trace-id'] = 'trace-123'
      },
      afterResponse(_client, _request, outcome) {
        if (outcome.type === 'response') afterStatuses.push(outcome.status)
        return 'continue'
      },
    }
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'temporarily unavailable' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    const result = await clientWith(middleware).request<{ ok: boolean }>('GET', '/status')

    expect(result).toEqual({ ok: true })
    expect(beforeAttempts).toEqual([1, 2])
    expect(afterStatuses).toEqual([503, 200])
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ 'x-trace-id': 'trace-123' })
  })

  it('allows middleware to retry immediately without consuming the network retry budget', async () => {
    let calls = 0
    const middleware: RequestMiddleware = {
      afterResponse() {
        calls += 1
        return calls === 1 ? 'retry-now' : 'continue'
      },
    }
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    const result = await clientWith(middleware, 0).request<{ ok: boolean }>('GET', '/status')

    expect(result).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('returns undefined for a successful 204 response', async () => {
    const fetch = vi.fn()
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)

    const result = await clientWith({}, 0).request<void>('DELETE', '/resource')

    expect(result).toBeUndefined()
  })
})
