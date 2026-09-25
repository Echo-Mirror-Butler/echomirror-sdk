# @echomirror/react

React context provider and hooks for EchoMirror SDK integrations — client access, user profiles, streaks, and real-time events.

## Installation

```bash
npm install @echomirror/react @echomirror/core react react-dom
```

Requires `react >= 18` and `react-dom >= 18` as peer dependencies.

## Usage

### 1. Wrap your application with `EchoMirrorProvider`

```tsx
import React from 'react'
import { EchoMirrorProvider } from '@echomirror/react'
import { Dashboard } from './Dashboard'

export function App() {
  return (
    <EchoMirrorProvider apiKey="your_api_key" authToken="optional_session_token">
      <Dashboard />
    </EchoMirrorProvider>
  )
}
```

### 2. Access state and SDK capabilities via hooks

```tsx
import React from 'react'
import {
  useEchoMirrorClient,
  useProfile,
  useMoodStreak,
  useSDKEvent,
} from '@echomirror/react'

export function Dashboard() {
  const client = useEchoMirrorClient()
  const { profile, isLoading: isProfileLoading, error: profileError } = useProfile()
  const { streak, isLoading: isStreakLoading, refetch: refreshStreak } = useMoodStreak()

  // Subscribe to real-time SDK events (automatically unsubscribes on unmount)
  useSDKEvent('mood:logged', (event) => {
    console.log(`Mood logged: ${event.entry.score}/10`)
    refreshStreak()
  })

  if (isProfileLoading || isStreakLoading) {
    return <div>Loading user profile...</div>
  }

  if (profileError) {
    return <div>Error loading profile: {profileError.message}</div>
  }

  return (
    <div>
      <h2>User: {profile?.id}</h2>
      <p>Current streak: {streak?.current ?? 0} days</p>
      <button onClick={refreshStreak}>Refresh Streak</button>
    </div>
  )
}
```

## API Summary

| Export | Type | Description |
|--------|------|-------------|
| `EchoMirrorProvider` | Component | Context provider supplying client instance and authenticated profile state |
| `useEchoMirrorClient()` | Hook | Accesses the initialized `EchoMirrorClient` directly |
| `useProfile()` | Hook | Returns current `{ profile, isLoading, error }` state |
| `useMoodStreak()` | Hook | Returns `{ streak, isLoading, error, refetch }` for user check-in streaks |
| `useSDKEvent(eventType, handler)` | Hook | Subscribes to SDK events on mount and removes listener on unmount |

## Documentation & Resources

- [Documentation](https://echomirror-sdk-site.vercel.app/)
- [GitHub Repository](https://github.com/Echo-Mirror-Butler/echomirror-sdk)

## License

MIT
