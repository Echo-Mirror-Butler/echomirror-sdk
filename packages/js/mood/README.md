# @echomirror/mood

Mood logging, historical trends, streaks, and AI reflection integration for the EchoMirror SDK.

## Installation

```bash
npm install @echomirror/mood @echomirror/core
```

## Usage

```ts
import { EchoMirrorClient } from '@echomirror/core'
import {
  logMood,
  getMoodHistory,
  getMoodEntry,
  getMoodStreak,
  getMoodSummary,
} from '@echomirror/mood'

const client = new EchoMirrorClient({ apiKey: 'your_api_key' })

// 1. Log a mood entry
const entry = await logMood(client, {
  score: 8,
  note: 'Shipped a major release ahead of schedule',
  tags: ['work', 'focus'],
})
console.log('Logged mood entry ID:', entry.id)

// 2. Fetch paginated mood history
const history = await getMoodHistory(client, {
  limit: 10,
  minScore: 5,
  tags: ['work'],
})
console.log(`Retrieved ${history.entries.length} entries of ${history.total} total`)

// 3. Fetch an entry by ID
const fetched = await getMoodEntry(client, entry.id)
console.log('Entry score:', fetched.score)

// 4. Retrieve current check-in streak
const streak = await getMoodStreak(client)
console.log(`Current streak: ${streak.current} days (longest: ${streak.longest})`)

// 5. Retrieve aggregated summary
const summary = await getMoodSummary(client, 'week')
console.log('Average score this week:', summary.averageScore)
```

## AI Reflections

Request automated AI reflections on specific mood entries:

```ts
import { requestAIReflection, getAIReflection } from '@echomirror/mood'

// Initiate async reflection generation
const initiated = await requestAIReflection(client, entry.id)

// Query the generated reflection
const reflection = await getAIReflection(client, entry.id)
if (reflection?.status === 'ready') {
  console.log('Reflection:', reflection.reflection)
}
```

## API Summary

| Export | Type | Description |
|--------|------|-------------|
| `logMood(client, payload)` | Function | Logs a mood entry and emits `mood:logged` event |
| `getMoodHistory(client, options)` | Function | Retrieves paginated and filtered mood records |
| `getMoodEntry(client, entryId)` | Function | Retrieves a specific mood entry by ID |
| `deleteMoodEntry(client, entryId)` | Function | Deletes a mood entry by ID |
| `getMoodStreak(client)` | Function | Returns current and longest check-in streak |
| `getMoodSummary(client, period?)` | Function | Retrieves aggregated statistics for a time window |
| `requestAIReflection(client, entryId)` | Function | Initiates asynchronous AI reflection generation |
| `getAIReflection(client, entryId)` | Function | Fetches generated AI reflection for an entry |

## Documentation & Resources

- [Documentation](https://echomirror-sdk-site.vercel.app/)
- [GitHub Repository](https://github.com/Echo-Mirror-Butler/echomirror-sdk)

## License

MIT
