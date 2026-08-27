export { EchoMirrorClient } from './client'
export { EchoMirrorError, AuthError, NetworkError, RateLimitError } from './errors'
export {
  LoggingMiddleware,
  MAX_MIDDLEWARE_RETRIES,
} from './middleware'
export type {
  RequestMiddleware,
  MiddlewareRequest,
  MiddlewareResponse,
  MiddlewareError,
  MiddlewareOutcome,
  MiddlewareDecision,
  RetryConfig,
} from './middleware'
export type {
  EchoMirrorConfig,
  MoodEntry,
  MoodScore,
  MoodTag,
  MoodStreak,
  MoodSummary,
  AIReflection,
  StellarBalance,
  StellarTransaction,
  EchoTransfer,
  UserProfile,
  GlobalFeedEntry,
  LeaderboardEntry,
  SDKEvent,
  SDKEventHandler,
} from './types'
