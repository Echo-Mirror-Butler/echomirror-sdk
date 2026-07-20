import { HorizonRateLimitError, StellarSdkError } from './errors'

export interface RetryOptions {
  /** Maximum number of retries after the first attempt. Default 3. */
  retries?: number
  /** Base delay for exponential backoff, in ms. Default 500. */
  baseDelayMs?: number
  /** Upper bound on any single backoff delay, in ms. Default 8000. */
  maxDelayMs?: number
  /** Called before each retry — useful for logging/metrics. */
  onRetry?: (error: StellarSdkError, attempt: number, delayMs: number) => void
}

/**
 * Whether an error is safe to retry. Only transient Horizon/network failures
 * (timeout, 429, 5xx) are — permanent transaction failures never are, because
 * resubmitting an envelope that failed validation can only fail again (or, for
 * tx_bad_seq, double-spend intent must be rebuilt, not replayed).
 */
export function isRetryableError(err: unknown): boolean {
  return err instanceof StellarSdkError && err.retryable
}

function backoffDelay(attempt: number, base: number, max: number): number {
  // Full-jitter exponential backoff: random(0, min(max, base * 2^attempt))
  return Math.random() * Math.min(max, base * 2 ** attempt)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Run `fn`, retrying only when it throws a retryable {@link StellarSdkError}.
 * Uses full-jitter exponential backoff; honours Retry-After on rate limits.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3
  const base = options.baseDelayMs ?? 500
  const max = options.maxDelayMs ?? 8000

  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (!isRetryableError(err) || attempt >= retries) throw err
      const sdkError = err as StellarSdkError
      let delay = backoffDelay(attempt, base, max)
      if (sdkError instanceof HorizonRateLimitError) {
        delay = Math.max(delay, sdkError.retryAfterSeconds * 1000)
      }
      options.onRetry?.(sdkError, attempt + 1, delay)
      await sleep(delay)
      attempt++
    }
  }
}
