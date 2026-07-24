import type { MoodScore } from '@echomirror/core'
import type { AnalyticsStorage } from './storage'

export type AnalyticsPropertyValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]

export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>

export interface DomainEventMap {
  mood_logged: { score: MoodScore; tagCount: number; hasNote: boolean }
  streak_milestone_reached: { current: number; milestone: number }
  gift_sent: { asset: 'XLM' | 'ECHO'; amount: number }
  wallet_connected: { provider: string; network: 'mainnet' | 'testnet' }
  ai_reflection_viewed: {
    entryId: string
    sentiment: 'positive' | 'neutral' | 'negative'
  }
  feed_viewed: { entryCount: number }
  leaderboard_viewed: { rank: number | null }
}

export type DomainEventName = keyof DomainEventMap

export interface AnalyticsEvent {
  messageId: string
  event: string
  properties: AnalyticsProperties
  anonymousId: string
  userId: string | null
  sessionId: string
  timestamp: string
}

export type PrivacyMode = 'strict' | 'full'

export type Transport = (batch: AnalyticsEvent[]) => Promise<void>

export interface AnalyticsConfig {
  writeKey?: string
  endpoint?: string
  transport?: Transport
  storage?: AnalyticsStorage
  privacyMode?: PrivacyMode
  flushAt?: number
  flushIntervalMs?: number
  autoFlush?: boolean
  storageKey?: string
  generateId?: () => string
  now?: () => number
  fetch?: typeof fetch
}
