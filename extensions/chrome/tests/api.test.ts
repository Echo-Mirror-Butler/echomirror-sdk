import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthError, NetworkError, RateLimitError } from '@echomirror/core'
import { describeError, fetchStreak, submitMood } from '../src/lib/api'
import { API_BASE_URL, DEFAULT_SETTINGS } from '../src/lib/settings'

const settings = { ...DEFAULT_SETTINGS, apiKey: 'em_live_abc', network: 'testnet' as const }

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({}),
    ...response,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('submitMood', () => {
  it('posts the check-in to the mood entries endpoint with the stored key', async () => {
    const entry = { id: 'entry_1', score: 8, tags: ['work'] }
    const fetchMock = mockFetch({ json: async () => entry })

    await expect(
      submitMood(settings, { score: 8, note: 'shipped it', tags: ['work'] }),
    ).resolves.toEqual(entry)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/mood/entries`)
    expect(init.method).toBe('POST')
    expect(init.headers['x-api-key']).toBe('em_live_abc')
    expect(init.headers['x-echomirror-network']).toBe('testnet')
    expect(JSON.parse(init.body)).toEqual({ score: 8, note: 'shipped it', tags: ['work'] })
  })

  it('surfaces an invalid key as an AuthError', async () => {
    mockFetch({ ok: false, status: 401 })
    await expect(submitMood(settings, { score: 5 })).rejects.toBeInstanceOf(AuthError)
  })
})

describe('fetchStreak', () => {
  it('reads the streak endpoint', async () => {
    const streak = { current: 3, longest: 9, lastLoggedAt: null, isActiveToday: false }
    const fetchMock = mockFetch({ json: async () => streak })

    await expect(fetchStreak(settings)).resolves.toEqual(streak)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/mood/streak`)
  })
})

describe('describeError', () => {
  it('explains what the user should do about each SDK error', () => {
    expect(describeError(new AuthError())).toMatch(/API key/)
    expect(describeError(new RateLimitError(30))).toMatch(/30s/)
    expect(describeError(new NetworkError())).toMatch(/connection/)
    expect(describeError(new Error('boom'))).toBe('boom')
    expect(describeError('not an error')).toBe('Something went wrong. Please try again.')
  })
})
