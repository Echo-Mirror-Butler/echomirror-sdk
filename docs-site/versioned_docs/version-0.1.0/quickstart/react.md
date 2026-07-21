---
sidebar_position: 2
---

# React Quickstart

## Install

```bash
npm install @echomirror/react @echomirror/core
```

## Wrap your app in the provider

```tsx
import { EchoMirrorProvider } from '@echomirror/react'

function App() {
  return (
    <EchoMirrorProvider apiKey={process.env.REACT_APP_ECHOMIRROR_API_KEY}>
      <MoodDashboard />
    </EchoMirrorProvider>
  )
}
```

## Use the mood hook

```tsx
import { useEchoMirror } from '@echomirror/react'

function MoodDashboard() {
  const { client, profile, isLoading, error } = useEchoMirror()

  if (isLoading) return <p>Loading...</p>
  if (error) return <p>Something went wrong: {error.message}</p>

  return (
    <div>
      <h2>Welcome back, {profile?.displayName}</h2>
      <p>Current streak: {profile?.moodStreak} days</p>
    </div>
  )
}
```

## Next steps

- [Core Concepts](../core-concepts) to understand how the pieces fit together
- [JS API Reference](../api/js) for the full typed API surface, including `EchoMirrorConfig`, `MoodStreak`, and `UserProfile`
