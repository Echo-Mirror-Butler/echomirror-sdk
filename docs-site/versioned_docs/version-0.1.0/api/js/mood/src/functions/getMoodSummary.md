# Function: getMoodSummary()

> **getMoodSummary**(`client`, `period?`): `Promise`\<[`MoodSummary`](../interfaces/MoodSummary.md)\>

Defined in: [packages/js/mood/src/index.ts:96](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/mood/src/index.ts#L96)

Get aggregated mood statistics for a time period.

## Parameters

### client

`EchoMirrorClient`

### period?

`"week"` \| `"month"` \| `"year"` \| `"all"`

## Returns

`Promise`\<[`MoodSummary`](../interfaces/MoodSummary.md)\>
