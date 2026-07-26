import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LeaderboardClient } from '../src/leaderboard'
import type { EchoMirrorClient } from '@echomirror/core'
import type { LeaderboardEntry } from '@echomirror/core'

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

describe('LeaderboardClient', () => {
  let client: EchoMirrorClient
  let leaderboard: LeaderboardClient

  const mockEntries: LeaderboardEntry[] = [
    { rank: 1, userId: 'a', displayName: 'Alice', streak: 10, totalEntries: 50, echoBalance: '1000', weeklyScore: 85 },
    { rank: 2, userId: 'b', displayName: 'Bob', streak: 8, totalEntries: 40, echoBalance: '800', weeklyScore: 72 },
    { rank: 3, userId: 'c', displayName: 'Charlie', streak: 5, totalEntries: 30, echoBalance: '500', weeklyScore: 65 },
  ]

  beforeEach(() => {
    client = createMockClient()
    leaderboard = new LeaderboardClient(client)
  })

  it('fetches the weekly leaderboard by default', async () => {
    ;(client.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockEntries)

    const result = await leaderboard.fetchLeaderboard()
    expect(result).toHaveLength(3)
    expect(client.request).toHaveBeenCalledWith('GET', '/social/leaderboard?window=weekly')
  })

  it('fetches leaderboard with custom window', async () => {
    ;(client.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockEntries)

    await leaderboard.fetchLeaderboard({ window: 'daily' })
    expect(client.request).toHaveBeenCalledWith('GET', '/social/leaderboard?window=daily')

    await leaderboard.fetchLeaderboard({ window: 'all-time' })
    expect(client.request).toHaveBeenCalledWith('GET', '/social/leaderboard?window=all-time')
  })

  it('returns cached data on repeated fetch with same window', async () => {
    const spy = vi.fn().mockResolvedValue(mockEntries)
    ;(client.request as ReturnType<typeof vi.fn>).mockImplementation(spy)

    await leaderboard.fetchLeaderboard()
    await leaderboard.fetchLeaderboard()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('refetches after clearCache()', async () => {
    const spy = vi.fn().mockResolvedValue(mockEntries)
    ;(client.request as ReturnType<typeof vi.fn>).mockImplementation(spy)

    await leaderboard.fetchLeaderboard()
    leaderboard.clearCache()
    await leaderboard.fetchLeaderboard()

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('applies tie-break sort and re-assigns ranks', async () => {
    const unsorted: LeaderboardEntry[] = [
      { rank: 0, userId: 'a', displayName: 'A', streak: 5, totalEntries: 100, echoBalance: '100', weeklyScore: 50 },
      { rank: 0, userId: 'b', displayName: 'B', streak: 3, totalEntries: 50, echoBalance: '200', weeklyScore: 50 },
      { rank: 0, userId: 'c', displayName: 'C', streak: 10, totalEntries: 80, echoBalance: '300', weeklyScore: 70 },
    ]
    ;(client.request as ReturnType<typeof vi.fn>).mockResolvedValue(unsorted)

    const result = await leaderboard.fetchLeaderboard()

    // Highest weeklyScore first: C (70), then A and B tied at 50
    expect(result[0].userId).toBe('c')
    expect(result[0].rank).toBe(1)
    // Among tied weeklyScore, lower totalEntries wins: B (50) beats A (100)
    expect(result[1].userId).toBe('b')
    expect(result[1].rank).toBe(2)
    expect(result[2].userId).toBe('a')
    expect(result[2].rank).toBe(3)
  })

  it('accepts custom basePath', async () => {
    const customLB = new LeaderboardClient(client, { basePath: '/custom/leaderboard' })
    ;(client.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockEntries)

    await customLB.fetchLeaderboard()
    expect(client.request).toHaveBeenCalledWith('GET', '/custom/leaderboard?window=weekly')
  })
})