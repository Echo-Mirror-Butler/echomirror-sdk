# @echomirror/core

Core HTTP API client, authentication management, retry with exponential backoff, request middleware, and shared TypeScript types for the EchoMirror SDK.

## Installation

```bash
npm install @echomirror/core
```

## Quickstart

```ts
import {
  EchoMirrorClient,
  EchoMirrorError,
  AuthError,
  RateLimitError,
  NetworkError,
} from '@echomirror/core'

const client = new EchoMirrorClient({
  apiKey: 'your_api_key',
  network: 'mainnet', // 'mainnet' | 'testnet'
  timeout: 10_000,
})

// Optional: attach a user session bearer token
client.setAuthToken('session_token_xyz')

try {
  const profile = await client.request('GET', '/users/me')
  console.log('User profile:', profile)
} catch (error) {
  if (error instanceof AuthError) {
    console.error('Authentication failed:', error.message)
  } else if (error instanceof RateLimitError) {
    console.warn(`Rate limited. Retry after ${error.retryAfterSeconds}s`)
  } else if (error instanceof NetworkError) {
    console.error('Network failure or request timeout:', error.message)
  } else if (error instanceof EchoMirrorError) {
    console.error(`API error ${error.statusCode}:`, error.message)
  }
}
```

## Middleware

The client lifecycle allows registering middleware via `client.use(middleware)` to inspect or modify outgoing requests and inspect responses.

```ts
import { EchoMirrorClient, LoggingMiddleware } from '@echomirror/core'
import type { RequestMiddleware } from '@echomirror/core'

const client = new EchoMirrorClient({ apiKey: 'your_api_key' })

// Attach built-in structured console logging
client.use(new LoggingMiddleware('my-app'))

// Register custom middleware to inject headers or handle token refresh
const authRefreshMiddleware: RequestMiddleware = {
  beforeRequest(client, req) {
    req.headers['x-request-id'] = crypto.randomUUID()
  },
  async afterResponse(client, req, outcome) {
    if (outcome.type === 'response' && outcome.status === 401) {
      // Re-authenticate and instruct the client to retry immediately
      client.setAuthToken('refreshed_session_token')
      return 'retry-now'
    }
    return 'continue'
  },
}

client.use(authRefreshMiddleware)
```

## Event Subscriptions

`EchoMirrorClient` includes an event bus for SDK-wide event publishing and subscriptions.

```ts
const unsubscribe = client.on('mood:logged', (event) => {
  console.log(`Mood entry logged: ${event.entry.score}/10`)
})

// Unsubscribe when no longer needed
unsubscribe()
```

## API Summary

| Export | Type | Description |
|--------|------|-------------|
| `EchoMirrorClient` | Class | Main HTTP client managing requests, headers, backoff retries, and middleware |
| `EchoMirrorError` | Error class | Base SDK error containing message and optional `statusCode` |
| `AuthError` | Error class | Thrown on 401 Unauthorized (`statusCode: 401`) |
| `RateLimitError` | Error class | Thrown on 429 Rate Limit, exposes `retryAfterSeconds` |
| `NetworkError` | Error class | Thrown on connection drops or request timeouts |
| `LoggingMiddleware` | Class | Reference request/response logger implementation |
| `MAX_MIDDLEWARE_RETRIES` | Constant | Maximum allowed middleware-requested immediate retries (default: `3`) |

## Documentation & Resources

- [Documentation](https://echomirror-sdk-site.vercel.app/)
- [GitHub Repository](https://github.com/Echo-Mirror-Butler/echomirror-sdk)

## License

MIT
