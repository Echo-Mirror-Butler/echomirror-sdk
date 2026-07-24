import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GlobalFeedClient } from '../src/feed'
import type { EchoMirrorClient } from '@echomirror/core'
import type { FeedResponse } from '../src/types'

function createMockClient(): EchoMirrorClient {
  return {
    request: vi.fn(),
    config: {} as never,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    setAuthToken: vi.fn(),
  } as unknown as EchoMirrorClient
}

describe('GlobalFeedClient', () => {
  let client: EchoMirrorClient
  let feed: GlobalFeedClient

  const mockResponse: FeedResponse = {
    entries: [
      {
        id: '1',
        score: 8,
        tags: ['work', 'social'],
        country: 'US',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        score: 6,
        tags: ['health'],
        createdAt: '2026-01-02T00:00:00Z',
      },
    ],
    nextCursor: 'cursor-2',
  }

  const emptyResponse: FeedResponse = {
    entries: [],
    nextCursor: null,
  }

  beforeEach(() => {
    client = createMockClient()
    feed = new GlobalFeedClient(client)
  })

  it('fetches the first page without a cursor', async () => {
    ;(client.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

    const result = await feed.fetchFeed()
    expect(result).toEqual(mockResponse)
    expect(client.request).toHaveBeenCalledWith('GET', '/social/feed?limit=20')
  })

  it('fetches subsequent pages with a cursor', async () => {
    ;(client.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

    const result = await feed.fetchFeed({ cursor: 'cursor-1', limit: 10 })
    expect(result).toEqual(mockResponse)
    expect(client.request).toHaveBeenCalledWith('GET', '/social/feed?limit=10&cursor=cursor-1')
  })

  it('returns cached response on repeated fetch with same cursor', async () => {
    const spy = vi.fn().mockResolvedValue(mockResponse)
    ;(client.request as ReturnType<typeof vi.fn>).mockImplementation(spy)

    await feed.fetchFeed()
    await feed.fetchFeed()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('clears cache and refetches after clearCache()', async () => {
    const spy = vi.fn().mockResolvedValue(mockResponse)
    ;(client.request as ReturnType<typeof vi.fn>).mockImplementation(spy)

    await feed.fetchFeed()
    feed.clearCache()
    await feed.fetchFeed()

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('returns empty response correctly', async () => {
    ;(client.request as ReturnType<typeof vi.fn>).mockResolvedValue(emptyResponse)

    const result = await feed.fetchFeed()
    expect(result.entries).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
  })

  it('accepts custom basePath', async () => {
    const customFeed = new GlobalFeedClient(client, { basePath: '/custom/feed' })
    ;(client.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

    await customFeed.fetchFeed()
    expect(client.request).toHaveBeenCalledWith('GET', '/custom/feed?limit=20')
  })
})