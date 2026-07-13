// ─── Config ───────────────────────────────────────────────────────────────────

export interface EchoMirrorConfig {
  /** Your EchoMirror API key — get one at echomirror.dev/developers */
  apiKey: string
  /** API base URL. Defaults to https://api.echomirror.dev/v1 */
  baseUrl?: string
  /** Stellar network. Defaults to 'mainnet' */
  network?: 'mainnet' | 'testnet'
  /** Request timeout in ms. Defaults to 10000 */
  timeout?: number
}

// ─── Mood ─────────────────────────────────────────────────────────────────────

/** Mood score 1 (very low) – 10 (excellent) */
export type MoodScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type MoodTag =
  | 'work'
  | 'relationships'
  | 'health'
  | 'sleep'
  | 'exercise'
  | 'creativity'
  | 'outdoors'
  | 'social'
  | 'food'
  | 'stress'
  | 'proud'
  | 'grateful'
  | 'anxious'
  | 'calm'
  | string

export interface MoodEntry {
  id: string
  userId: string
  score: MoodScore
  note?: string
  tags: MoodTag[]
  aiReflection?: AIReflection
  createdAt: string
  updatedAt: string
}

export interface MoodStreak {
  current: number
  longest: number
  lastLoggedAt: string | null
  isActiveToday: boolean
}

export interface MoodSummary {
  period: 'week' | 'month' | 'year' | 'all'
  average: number
  min: number
  max: number
  totalEntries: number
  topTags: Array<{ tag: MoodTag; count: number }>
  trend: 'improving' | 'declining' | 'stable'
}

export interface AIReflection {
  id: string
  entryId: string
  content: string
  sentiment: 'positive' | 'neutral' | 'negative'
  themes: string[]
  generatedAt: string
}

// ─── Stellar ──────────────────────────────────────────────────────────────────

export interface StellarBalance {
  xlm: string
  echo: string
  publicKey: string
  network: 'mainnet' | 'testnet'
  lastFetched: string
}

export interface StellarTransaction {
  id: string
  type: 'send' | 'receive'
  asset: 'XLM' | 'ECHO'
  amount: string
  from: string
  to: string
  memo?: string
  createdAt: string
  stellarTxHash: string
}

export interface EchoTransfer {
  from: string
  to: string
  amount: number
  memo?: string
}

// ─── Social ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  username: string
  displayName: string
  avatarUrl?: string
  echoBalance: string
  currentStreak: number
  totalEntries: number
  joinedAt: string
}

export interface GlobalFeedEntry {
  id: string
  score: MoodScore
  tags: MoodTag[]
  country?: string
  city?: string
  createdAt: string
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  displayName: string
  avatarUrl?: string
  streak: number
  totalEntries: number
  echoBalance: string
  weeklyScore: number
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type SDKEvent =
  | { type: 'mood:logged'; entry: MoodEntry }
  | { type: 'mood:streak_updated'; streak: MoodStreak }
  | { type: 'stellar:transfer_sent'; tx: StellarTransaction }
  | { type: 'stellar:transfer_received'; tx: StellarTransaction }
  | { type: 'auth:signed_in'; profile: UserProfile }
  | { type: 'auth:signed_out' }

export type SDKEventHandler<T extends SDKEvent = SDKEvent> = (event: T) => void
