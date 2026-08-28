import type { EchoMirrorClient } from './client'

/** What the client should do after a middleware's `afterResponse` hook runs. */
export type MiddlewareDecision = 'continue' | 'retry-now'

/** The outgoing request, as seen by middleware before it is sent. */
export interface MiddlewareRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
  /** 1-based attempt number for this logical request. */
  attempt: number
}

/** A successful HTTP response seen by middleware. */
export interface MiddlewareResponse {
  type: 'response'
  status: number
  headers: Record<string, string>
  body: unknown
  durationMs: number
}

/** An error seen by middleware. */
export interface MiddlewareError {
  type: 'error'
  error: Error
}

/** What happened on this attempt, passed to `afterResponse`. */
export type MiddlewareOutcome = MiddlewareResponse | MiddlewareError

/** A hook into the client's request/response lifecycle. */
export interface RequestMiddleware {
  /** Called before each attempt is sent. Mutate `request` to add/override headers or transform the body. */
  beforeRequest?(
    client: EchoMirrorClient,
    request: MiddlewareRequest,
  ): Promise<void> | void

  /** Called after each attempt resolves, successfully or not. */
  afterResponse?(
    client: EchoMirrorClient,
    request: MiddlewareRequest,
    outcome: MiddlewareOutcome,
  ): Promise<MiddlewareDecision> | MiddlewareDecision
}

/** Options for the retry/backoff behavior. */
export interface RetryConfig {
  /** Maximum retry attempts on transient failures (default: 3). */
  maxRetries?: number
  /** Base delay in ms for exponential backoff (default: 100). */
  baseDelayMs?: number
  /** Maximum delay in ms (default: 5000). */
  maxDelayMs?: number
}

/**
 * Reference middleware: structured per-attempt request logging via `console`.
 *
 * Logs method, path, attempt number, status (or error), and duration.
 */
export class LoggingMiddleware implements RequestMiddleware {
  private _prefix: string

  constructor(prefix = 'echomirror-sdk') {
    this._prefix = prefix
  }

  async beforeRequest(
    _client: EchoMirrorClient,
    req: MiddlewareRequest,
  ): Promise<void> {
    console.debug(
      `[${this._prefix}] → ${req.method} ${req.url} (attempt ${req.attempt})`,
    )
  }

  async afterResponse(
    _client: EchoMirrorClient,
    req: MiddlewareRequest,
    outcome: MiddlewareOutcome,
  ): Promise<MiddlewareDecision> {
    if (outcome.type === 'response') {
      console.info(
        `[${this._prefix}] ← ${req.method} ${req.url} ${outcome.status} (${outcome.durationMs}ms, attempt ${req.attempt})`,
      )
    } else {
      console.warn(
        `[${this._prefix}] ✗ ${req.method} ${req.url} ${outcome.error.message} (attempt ${req.attempt})`,
      )
    }
    return 'continue'
  }
}

/** Maximum middleware-requested retries per logical request. */
export const MAX_MIDDLEWARE_RETRIES = 3

/** Base delay of 100ms, exponential backoff: 100ms * 2^attempt, capped at 5s. */
function calculateBackoff(attempt: number, baseMs: number, maxMs: number): number {
  const exponentialDelay = baseMs * 2 ** attempt
  const cappedDelay = Math.min(exponentialDelay, maxMs)
  // Add jitter: +/- 25% of the delay
  const jitter = (cappedDelay / 4) * (Math.random() * 2 - 1)
  return Math.max(0, cappedDelay + jitter)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Check if an error is retryable (transient failures). */
function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    // Network errors are retryable
    if (err.name === 'NetworkError' || err.message.includes('Network error')) {
      return true
    }
    // Rate limit errors are retryable
    if (err.name === 'RateLimitError') {
      return true
    }
    // 5xx errors are retryable (check statusCode if available)
    if ('statusCode' in err && typeof (err as any).statusCode === 'number') {
      return (err as any).statusCode >= 500
    }
  }
  return false
}
