export class EchoMirrorError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'EchoMirrorError'
  }
}

export class AuthError extends EchoMirrorError {
  constructor(message = 'Authentication failed') {
    super(message, 401)
    this.name = 'AuthError'
  }
}

export class NetworkError extends EchoMirrorError {
  constructor(message = 'Network request failed') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class RateLimitError extends EchoMirrorError {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterSeconds}s`, 429)
    this.name = 'RateLimitError'
  }
}
