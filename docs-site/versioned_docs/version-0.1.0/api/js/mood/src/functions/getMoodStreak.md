# Function: getMoodStreak()

> **getMoodStreak**(`client`): `Promise`\<[`MoodStreak`](../interfaces/MoodStreak.md)\>

Defined in: [packages/js/mood/src/index.ts:89](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/mood/src/index.ts#L89)

Get the user's current and longest streak.

## Parameters

### client

`EchoMirrorClient`

## Returns

`Promise`\<[`MoodStreak`](../interfaces/MoodStreak.md)\>

## Example

```ts
const streak = await getMoodStreak(client)
if (!streak.isActiveToday) {
  showCheckInPrompt()
}
```
