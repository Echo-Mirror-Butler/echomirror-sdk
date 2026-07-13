import type { EchoMirrorConfig, SDKEvent, SDKEventHandler } from './types'
import { EchoMirrorError, NetworkError, AuthError, RateLimitError } from './errors'

const DEFAULT_BASE_URL = 'https://api.echomirror.dev/v1'
const DEFAULT_TIMEOUT = 10_000

export class EchoMirrorClient {
  readonly config: Required<EchoMirrorConfig>
  private _handlers = new Map<string, Set<SDKEventHandler<SDKEvent>>>()
  private _authToken: string | null = null

  constructor(config: EchoMirrorConfig) {
    this.config = {
      baseUrl: DEFAULT_BASE_URL,
      network: 'mainnet',
      timeout: DEFAULT_TIMEOUT,
      ...config,
    }
  }

  // ── HTTP ────────────────────────────────────────────────────────────────────

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeout)

    const headers: Record<string, string> = {
      'x-api-key': this.config.apiKey,
      'x-echomirror-network': this.config.network,
    }
    if (body) headers['content-type'] = 'application/json'
    if (this._authToken) headers['authorization'] = `Bearer ${this._authToken}`

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new NetworkError(`Request timed out after ${this.config.timeout}ms`)
      }
      throw new NetworkError(`Network error: ${(err as Error).message}`)
    } finally {
      clearTimeout(timer)
    }

    if (res.status === 401) throw new AuthError('Invalid or expired API key')
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after')
      throw new RateLimitError(retryAfter ? parseInt(retryAfter) : 60)
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new EchoMirrorError(body.message ?? `HTTP ${res.status}`, res.status)
    }

    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
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
