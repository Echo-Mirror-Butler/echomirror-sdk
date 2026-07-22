# Function: logMood()

> **logMood**(`client`, `payload`): `Promise`\<[`MoodEntry`](../interfaces/MoodEntry.md)\>

Defined in: [packages/js/mood/src/index.ts:33](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/mood/src/index.ts#L33)

Log a mood entry for the authenticated user.

## Parameters

### client

`EchoMirrorClient`

### payload

[`LogMoodPayload`](../interfaces/LogMoodPayload.md)

## Returns

`Promise`\<[`MoodEntry`](../interfaces/MoodEntry.md)\>

## Example

```ts
const entry = await logMood(client, { score: 7, note: 'Great day', tags: ['work'] })
```
