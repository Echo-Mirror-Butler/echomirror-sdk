import type { EchoMirrorConfig, SDKEvent, SDKEventHandler } from './types'
import { EchoMirrorError, NetworkError, AuthError, RateLimitError } from './errors'
import type {
  RequestMiddleware,
  RetryConfig,
  MiddlewareRequest,
  MiddlewareOutcome,
  MiddlewareDecision,
} from './middleware'
import { MAX_MIDDLEWARE_RETRIES, sleep } from './middleware'

const DEFAULT_BASE_URL = 'https://api.echomirror.dev/v1'
const DEFAULT_TIMEOUT = 10_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_DELAY_MS = 100
const DEFAULT_MAX_DELAY_MS = 5_000

export class EchoMirrorClient {
  readonly config: Required<
    Pick<EchoMirrorConfig, 'apiKey' | 'baseUrl' | 'network' | 'timeout'>
  > & {
    maxRetries: number
    baseDelayMs: number
    maxDelayMs: number
  }
  private _handlers = new Map<string, Set<SDKEventHandler<SDKEvent>>>()
  private _authToken: string | null = null
  private _middlewares: RequestMiddleware[] = []

  constructor(config: EchoMirrorConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      network: config.network ?? 'mainnet',
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: config.retry?.maxRetries ?? DEFAULT_MAX_RETRIES,
      baseDelayMs: config.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
      maxDelayMs: config.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    }
  }

  // ── Middleware ─────────────────────────────────────────────────────────────

  /** Register a middleware to run around every HTTP attempt. */
  use(middleware: RequestMiddleware): this {
    this._middlewares.push(middleware)
    return this
  }

  /** Remove a previously registered middleware. */
  removeMiddleware(middleware: RequestMiddleware): this {
    this._middlewares = this._middlewares.filter((m) => m !== middleware)
    return this
  }

  // ── HTTP ────────────────────────────────────────────────────────────────────

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const maxAttempts = this.config.maxRetries + 1
    let middlewareRetries = 0

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this._requestOnce<T>(method, path, body, attempt)

      if (result.decision === 'retry-now') {
        middlewareRetries++
        if (middlewareRetries > MAX_MIDDLEWARE_RETRIES) {
          throw new EchoMirrorError(
            'middleware requested a retry too many times',
          )
        }
        // Retry immediately without counting against maxRetries
        attempt--
        continue
      }

      if (result.decision === 'error' && result.error) {
        const err = result.error

        // Check if retryable
        if (attempt < maxAttempts && this._isRetryable(err)) {
          const backoff = this._calculateBackoff(attempt - 1)

          // For rate-limit errors, respect retry-after
          if (err instanceof RateLimitError) {
            const delay = Math.max(
              backoff,
              err.retryAfterSeconds * 1000,
            )
            await sleep(delay)
          } else {
            await sleep(backoff)
          }
          continue
        }

        throw err
      }

      if (result.decision === 'success' && result.value !== undefined) {
        return result.value as T
      }
    }

    throw new EchoMirrorError('Request failed after all retries')
  }

  private _isRetryable(err: unknown): boolean {
    if (err instanceof RateLimitError) return true
    if (err instanceof NetworkError) return true
    if (
      err instanceof EchoMirrorError &&
      typeof err.statusCode === 'number' &&
      err.statusCode >= 500
    ) {
      return true
    }
    return false
  }

  private _calculateBackoff(attempt: number): number {
    const exponentialDelay =
      this.config.baseDelayMs * 2 ** attempt
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs)
    // Add jitter: +/- 25% of the delay
    const jitter = (cappedDelay / 4) * (Math.random() * 2 - 1)
    return Math.max(0, cappedDelay + jitter)
  }

  /** Execute a single HTTP attempt, running middleware around it. */
  private async _requestOnce<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: unknown,
    attempt: number,
  ): Promise<
    | { decision: 'success'; value: T }
    | { decision: 'retry-now' }
    | { decision: 'error'; error: Error }
  > {
    const url = `${this.config.baseUrl}${path}`

    const request: MiddlewareRequest = {
      method,
      url,
      headers: {
        'x-api-key': this.config.apiKey,
        'x-echomirror-network': this.config.network,
      },
      body,
      attempt,
    }
    if (body) request.headers['content-type'] = 'application/json'
    if (this._authToken)
      request.headers['authorization'] = `Bearer ${this._authToken}`

    // Run beforeRequest hooks
    for (const mw of this._middlewares) {
      if (mw.beforeRequest) {
        await mw.beforeRequest(this, request)
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeout)
    const started = Date.now()

    let res: Response
    try {
      res = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      const networkErr =
        (err as Error).name === 'AbortError'
          ? new NetworkError(`Request timed out after ${this.config.timeout}ms`)
          : new NetworkError(`Network error: ${(err as Error).message}`)

      const outcome: MiddlewareOutcome = { type: 'error', error: networkErr }
      for (const mw of this._middlewares) {
        if (mw.afterResponse) {
          const decision = await mw.afterResponse(this, request, outcome)
          if (decision === 'retry-now') {
            return { decision: 'retry-now' }
          }
        }
      }
      return { decision: 'error', error: networkErr }
    }

    clearTimeout(timer)
    const durationMs = Date.now() - started

    // Read the response body once
    let responseBody: unknown
    let responseText: string | undefined
    try {
      responseText = await res.text()
      if (responseText) {
        try {
          responseBody = JSON.parse(responseText)
        } catch {
          responseBody = responseText
        }
      }
    } catch {
      // body read failed
    }

    // Build outcome
    const responseHeaders: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    const outcome: MiddlewareOutcome = {
      type: 'response',
      status: res.status,
      headers: responseHeaders,
      body: responseBody,
      durationMs,
    }

    // Run afterResponse hooks
    for (const mw of this._middlewares) {
      if (mw.afterResponse) {
        const decision = await mw.afterResponse(this, request, outcome)
        if (decision === 'retry-now') {
          return { decision: 'retry-now' }
        }
      }
    }

    // Handle status codes
    if (res.status === 401) {
      return {
        decision: 'error',
        error: new AuthError('Invalid or expired API key'),
      }
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after')
      return {
        decision: 'error',
        error: new RateLimitError(retryAfter ? parseInt(retryAfter) : 60),
      }
    }
    if (!res.ok) {
      const message =
        typeof responseBody === 'object' &&
        responseBody !== null &&
        'message' in responseBody
          ? (responseBody as { message: string }).message
          : `HTTP ${res.status}`
      return {
        decision: 'error',
        error: new EchoMirrorError(message, res.status),
      }
    }

    if (res.status === 204) {
      return { decision: 'success', value: undefined as T }
    }
    return { decision: 'success', value: responseBody as T }
  }

  // ── Auth token ──────────────────────────────────────────────────────────────

  setAuthToken(token: string | null) {
    this._authToken = token
  }

  // ── Event bus ───────────────────────────────────────────────────────────────

  on<T extends SDKEvent>(eventType: T['type'], handler: SDKEventHandler<T>) {
    if (!this._handlers.has(eventType)) {
      this._handlers.set(eventType, new Set())
    }
    this._handlers.get(eventType)!.add(handler as SDKEventHandler<SDKEvent>)
    return () => this.off(eventType, handler)
  }

  off<T extends SDKEvent>(eventType: T['type'], handler: SDKEventHandler<T>) {
    this._handlers.get(eventType)?.delete(handler as SDKEventHandler<SDKEvent>)
  }

  emit<T extends SDKEvent>(event: T) {
    this._handlers.get(event.type)?.forEach((h) => h(event))
  }
}
