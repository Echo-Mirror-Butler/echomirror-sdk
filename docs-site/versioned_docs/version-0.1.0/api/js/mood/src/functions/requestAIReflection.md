# Function: requestAIReflection()

> **requestAIReflection**(`client`, `entryId`): `Promise`\<[`AIReflection`](../interfaces/AIReflection.md)\>

Defined in: [packages/js/mood/src/index.ts:107](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/mood/src/index.ts#L107)

Request an AI reflection for a specific mood entry.
Reflections are generated asynchronously — poll or use webhooks.

## Parameters

### client

`EchoMirrorClient`

### entryId

`string`

## Returns

`Promise`\<[`AIReflection`](../interfaces/AIReflection.md)\>
