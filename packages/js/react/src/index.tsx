import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { EchoMirrorClient } from '@echomirror/core'
import type { EchoMirrorConfig, MoodStreak, UserProfile } from '@echomirror/core'

// ─── Context ──────────────────────────────────────────────────────────────────

interface EchoMirrorContextValue {
  client: EchoMirrorClient
  profile: UserProfile | null
  isLoading: boolean
  error: Error | null
}

const EchoMirrorContext = createContext<EchoMirrorContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface EchoMirrorProviderProps {
  apiKey: string
  config?: Omit<EchoMirrorConfig, 'apiKey'>
  authToken?: string
  children: React.ReactNode
}

/**
 * Wrap your app with this provider to access all EchoMirror hooks.
 *
 * @example
 * <EchoMirrorProvider apiKey="your_api_key">
 *   <App />
 * </EchoMirrorProvider>
 */
export function EchoMirrorProvider({
  apiKey,
  config,
  authToken,
  children,
}: EchoMirrorProviderProps) {
  const [client] = useState(
    () => new EchoMirrorClient({ apiKey, ...config }),
  )
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (authToken) {
      client.setAuthToken(authToken)
      setIsLoading(true)
      client
        .request<UserProfile>('GET', '/users/me')
        .then(setProfile)
        .catch(setError)
        .finally(() => setIsLoading(false))
    } else {
      client.setAuthToken(null)
      setProfile(null)
    }
  }, [client, authToken])

  return (
    <EchoMirrorContext.Provider value={{ client, profile, isLoading, error }}>
      {children}
    </EchoMirrorContext.Provider>
  )
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useEchoMirror() {
  const ctx = useContext(EchoMirrorContext)
  if (!ctx) {
    throw new Error('useEchoMirror must be used inside <EchoMirrorProvider>')
  }
  return ctx
}

/**
 * Access the raw EchoMirrorClient for direct API calls.
 */
export function useEchoMirrorClient(): EchoMirrorClient {
  return useEchoMirror().client
}

/**
 * Get the authenticated user's profile.
 *
 * @example
 * const { profile, isLoading } = useProfile()
 */
export function useProfile() {
  const { profile, isLoading, error } = useEchoMirror()
  return { profile, isLoading, error }
}

/**
 * Get and refresh the user's mood streak.
 *
 * @example
 * const { streak, refetch } = useMoodStreak()
 * return <p>{streak?.current} day streak 🔥</p>
 */
export function useMoodStreak() {
  const { client } = useEchoMirror()
  const [streak, setStreak] = useState<MoodStreak | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await client.request<MoodStreak>('GET', '/mood/streak')
      setStreak(result)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => { refetch() }, [refetch])

  return { streak, isLoading, error, refetch }
}

/**
 * Listen to real-time SDK events.
 *
 * @example
 * useSDKEvent('mood:logged', (event) => {
 *   toast(`Mood logged: ${event.entry.score}/10`)
 * })
 */
export function useSDKEvent<T extends Parameters<typeof EchoMirrorClient.prototype.on>[0]>(
  eventType: T,
  handler: Parameters<typeof EchoMirrorClient.prototype.on<{ type: T } & Parameters<typeof EchoMirrorClient.prototype.emit>[0]>>[1],
) {
  const { client } = useEchoMirror()
  useEffect(() => {
    return client.on(eventType as never, handler as never)
  }, [client, eventType, handler])
}
