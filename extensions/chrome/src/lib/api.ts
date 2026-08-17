import { AuthError, EchoMirrorClient, NetworkError, RateLimitError } from '@echomirror/core'
import type { MoodEntry, MoodStreak } from '@echomirror/core'
import { getMoodStreak, logMood, type LogMoodPayload } from '@echomirror/mood'
import { API_BASE_URL, type ExtensionSettings } from './settings'

/**
 * Build an SDK client from the stored settings. The client is created per call
 * rather than kept around — the service worker is suspended between events, so
 * a cached instance would not survive anyway.
 */
export function createClient(settings: ExtensionSettings): EchoMirrorClient {
  return new EchoMirrorClient({
    apiKey: settings.apiKey,
    baseUrl: API_BASE_URL,
    network: settings.network,
  })
}

export function submitMood(
  settings: ExtensionSettings,
  payload: LogMoodPayload,
): Promise<MoodEntry> {
  return logMood(createClient(settings), payload)
}

export function fetchStreak(settings: ExtensionSettings): Promise<MoodStreak> {
  return getMoodStreak(createClient(settings))
}

/** Turn an SDK error into a message that makes sense in a 320px popup. */
export function describeError(error: unknown): string {
  if (error instanceof AuthError) {
    return 'Your API key was rejected. Update it in the extension options.'
  }
  if (error instanceof RateLimitError) {
    return `Too many requests. Try again in ${error.retryAfterSeconds}s.`
  }
  if (error instanceof NetworkError) {
    return 'Could not reach EchoMirror. Check your connection and try again.'
  }
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Please try again.'
}
