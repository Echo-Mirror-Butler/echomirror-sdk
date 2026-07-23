# Function: useSDKEvent()

> **useSDKEvent**\<`T`\>(`eventType`, `handler`): `void`

Defined in: [packages/js/react/src/index.tsx:134](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/react/src/index.tsx#L134)

Listen to real-time SDK events.

## Type Parameters

### T

`T` *extends* `"mood:logged"` \| `"mood:streak_updated"` \| `"stellar:transfer_sent"` \| `"stellar:transfer_received"` \| `"auth:signed_in"` \| `"auth:signed_out"`

## Parameters

### eventType

`T`

### handler

`SDKEventHandler`\<`object` & `SDKEvent`\>

## Returns

`void`

## Example

```ts
useSDKEvent('mood:logged', (event) => {
  toast(`Mood logged: ${event.entry.score}/10`)
})
```
