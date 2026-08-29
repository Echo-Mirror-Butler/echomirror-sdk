import { useCallback, useEffect, useState, useRef } from 'react'
import { GlobalFeedClient } from './feed'
import { LeaderboardClient } from './leaderboard'
import { SocialSubscription } from './realtime'
import type { EchoMirrorClient } from '@echomirror/core'
import type { GlobalFeedEntry } from '@echomirror/core'
import type { LeaderboardEntry } from '@echomirror/core'
import type { LeaderboardWindow, FeedResponse, CacheConfig, SocialLiveEvent } from './types'

/**
 * React hook providing global feed state with infinite-scroll support.
 *
 * Cache behavior: the hook creates a `GlobalFeedClient` internally, which
 * owns its own `TtlCache`. All instances of `useGlobalFeed()` within the
 * same component tree that share the same `EchoMirrorClient` **will NOT**
 * share cache — each hook call creates its own `GlobalFeedClient`. If you
 * need cache sharing, create a `GlobalFeedClient` externally, pass it via
 * context, and use `useGlobalFeedWithClient()`.
 *
 * @example
 * const { entries, isLoading, fetchMore, hasMore, refresh } = useGlobalFeed(client)
 */
export function useGlobalFeed(
  client: EchoMirrorClient,
  options?: { limit?: number; cache?: CacheConfig },
): {
  entries: GlobalFeedEntry[]
  isLoading: boolean
  error: Error | null
  fetchMore: () => void
  refresh: () => void
  hasMore: boolean
} {
  const [entries, setEntries] = useState<GlobalFeedEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const feedRef = useRef<GlobalFeedClient | null>(null)
  const subscriptionRef = useRef<SocialSubscription | null>(null)

  // Lazy init
  if (!feedRef.current) {
    feedRef.current = new GlobalFeedClient(client, { cache: options?.cache })
  }

  const fetchInitial = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res: FeedResponse = await feedRef.current!.fetchFeed({ limit: options?.limit })
      setEntries(res.entries)
      setNextCursor(res.nextCursor)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [options?.limit])

  const fetchMore = useCallback(async () => {
    if (!nextCursor || isLoading) return
    setIsLoading(true)
    try {
      const res: FeedResponse = await feedRef.current!.fetchFeed({
        cursor: nextCursor,
        limit: options?.limit,
      })
      setEntries((prev) => [...prev, ...res.entries])
      setNextCursor(res.nextCursor)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [nextCursor, isLoading, options?.limit])

  const refresh = useCallback(async () => {
    feedRef.current?.clearCache()
    await fetchInitial()
  }, [fetchInitial])

  // Initial fetch on mount
  useEffect(() => {
    fetchInitial()
  }, [fetchInitial])

  // Real-time subscription for new feed entries
  useEffect(() => {
    if (!subscriptionRef.current) {
      subscriptionRef.current = new SocialSubscription()
    }
    const sub = subscriptionRef.current
    const unsubscribe = sub.subscribe((event: SocialLiveEvent) => {
      if (event.type === 'feed:new_entry') {
        setEntries((prev) => [event.entry, ...prev])
      }
    })
    return unsubscribe
  }, [])

  return { entries, isLoading, error, fetchMore, refresh, hasMore: nextCursor !== null }
}

/**
 * React hook providing leaderboard state with configurable time window.
 *
 * @example
 * const { entries, isLoading, refresh } = useLeaderboard(client, 'daily')
 */
export function useLeaderboard(
  client: EchoMirrorClient,
  window: LeaderboardWindow = 'weekly',
  options?: { cache?: CacheConfig; limit?: number },
): {
  entries: LeaderboardEntry[]
  isLoading: boolean
  error: Error | null
  refresh: () => void
} {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const leaderboardRef = useRef<LeaderboardClient | null>(null)
  const subscriptionRef = useRef<SocialSubscription | null>(null)

  if (!leaderboardRef.current) {
    leaderboardRef.current = new LeaderboardClient(client, { cache: options?.cache })
  }

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await leaderboardRef.current!.fetchLeaderboard({ limit: options?.limit })
      setEntries(data)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [options?.limit])

  const refresh = useCallback(async () => {
    leaderboardRef.current?.clearCache()
    await fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Real-time subscription for leaderboard updates
  useEffect(() => {
    if (!subscriptionRef.current) {
      subscriptionRef.current = new SocialSubscription()
    }
    const sub = subscriptionRef.current
    const unsubscribe = sub.subscribe((event: SocialLiveEvent) => {
      if (event.type === 'leaderboard:updated' && event.window === window) {
        setEntries(event.entries)
      }
    })
    return unsubscribe
  }, [options?.limit])

  return { entries, isLoading, error, refresh }
}
