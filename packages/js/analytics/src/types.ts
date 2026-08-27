export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type EventProperties = Record<string, JsonValue | undefined>

export type MoodScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export type MoodCategory = 'very_low' | 'low' | 'neutral' | 'good' | 'excellent'

export interface MoodLoggedProperties {
  score: MoodScore
  /** Never transmitted in default privacy mode. */
  note?: string
  /** Never transmitted in default privacy mode. Only tagCount is sent. */
  tags?: string[]
  source?: 'manual' | 'prompt' | 'import' | 'widget'
}

export interface StreakMilestoneReachedProperties {
  milestone: number
  currentStreak: number
}

export interface GiftSentProperties {
  amount: number
  asset: string
  recipientType?: 'friend' | 'community' | 'other'
}

export interface WalletConnectedProperties {
  network: 'mainnet' | 'testnet' | string
  provider?: string
  reconnect?: boolean
}

export interface AIReflectionViewedProperties {
  sentiment?: 'positive' | 'neutral' | 'negative'
  themeCount?: number
  source?: 'notification' | 'history' | 'mood_entry' | 'other'
}

export interface FriendFollowedProperties {
  source?: 'feed' | 'leaderboard' | 'profile' | 'other'
}

export interface LeaderboardViewedProperties {
  period: 'daily' | 'weekly' | 'all-time'
  ownRank?: number
}

/** Built-in events provide property autocomplete and compile-time checking. */
export interface AnalyticsEventMap {
  mood_logged: MoodLoggedProperties
  streak_milestone_reached: StreakMilestoneReachedProperties
  gift_sent: GiftSentProperties
  wallet_connected: WalletConnectedProperties
  ai_reflection_viewed: AIReflectionViewedProperties
  friend_followed: FriendFollowedProperties
  leaderboard_viewed: LeaderboardViewedProperties
}

export type AnalyticsEventName = keyof AnalyticsEventMap

export interface AnalyticsEvent {
  /** Stable across retries so destinations can deduplicate deliveries. */
  id: string
  name: string
  timestamp: string
  anonymousId: string
  sessionId: string
  userId?: string
  properties: Record<string, JsonValue>
}

export interface AnalyticsBatch {
  schemaVersion: 1
  batchId: string
  sentAt: string
  events: AnalyticsEvent[]
}

export type AnalyticsTransport = (batch: AnalyticsBatch) => Promise<void>

/** localStorage-compatible synchronous persistence. */
export interface AnalyticsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PrivacyOptions {
  /**
   * Sends notes, tags, and other sensitive property values unchanged.
   * This is false by default and should only be enabled with informed consent.
   */
  allowSensitiveProperties?: boolean
}

export interface AnalyticsConfig {
  transport: AnalyticsTransport
  storage?: AnalyticsStorage
  storageKey?: string
  /** Storage key for the purge audit log. Defaults to `'echomirror.analytics.audit.v1'`. */
  auditStorageKey?: string
  batchSize?: number
  /** Set to 0 to disable timed flushing. Defaults to 10 seconds. */
  flushIntervalMs?: number
  privacy?: PrivacyOptions
  /** Receives background flush/storage errors that cannot be thrown to track(). */
  onError?: (error: unknown) => void
  /** Test/runtime hooks. */
  now?: () => Date
  generateId?: () => string
}

export interface MoodAggregateInput {
  score: number
  /** Tags are processed locally and are never sent by the helper. */
  tags?: readonly string[]
  timestamp: string | number | Date
}

export interface MoodTagCount {
  tag: string
  count: number
}

export interface MoodRollup {
  averageScore: number | null
  entryCount: number
  mostCommonTags: MoodTagCount[]
  from: string
  to: string
}

export interface MoodRollupOptions {
  from: string | number | Date
  to: string | number | Date
  tagLimit?: number
}

export interface PurgeAuditRecord {
  /** ISO-8601 timestamp of when the purge was executed. */
  purgedAt: string
  /**
   * Opaque identifier for the purged user.
   * Contains NO PII — this is a stable hash or opaque ID, not an email, name, or address.
   */
  userHash: string
  /** Number of raw events removed. */
  eventsRemoved: number
  /** The storage key the events were purged from. */
  storageKey: string
}

export interface PurgeResult {
  /** True if events were found and removed; false if no matching events existed. */
  purged: boolean
  /** Number of raw events removed from storage. */
  eventsRemoved: number
  /** Audit record written to the audit log for this purge. */
  audit: PurgeAuditRecord
}
