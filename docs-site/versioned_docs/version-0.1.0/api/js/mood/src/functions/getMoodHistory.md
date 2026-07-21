# Function: getMoodHistory()

> **getMoodHistory**(`client`, `options?`): `Promise`\<\{ `entries`: [`MoodEntry`](../interfaces/MoodEntry.md)[]; `total`: `number`; \}\>

Defined in: [packages/js/mood/src/index.ts:45](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/mood/src/index.ts#L45)

Get paginated mood history for the authenticated user.

## Parameters

### client

`EchoMirrorClient`

### options?

[`GetMoodHistoryOptions`](../interfaces/GetMoodHistoryOptions.md) = `{}`

## Returns

`Promise`\<\{ `entries`: [`MoodEntry`](../interfaces/MoodEntry.md)[]; `total`: `number`; \}\>
