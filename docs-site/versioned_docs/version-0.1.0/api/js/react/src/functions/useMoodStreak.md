# Function: useMoodStreak()

> **useMoodStreak**(): `object`

Defined in: [packages/js/react/src/index.tsx:103](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/react/src/index.tsx#L103)

Get and refresh the user's mood streak.

## Returns

`object`

### error

> **error**: `Error` \| `null`

### isLoading

> **isLoading**: `boolean`

### refetch

> **refetch**: () => `Promise`\<`void`\>

#### Returns

`Promise`\<`void`\>

### streak

> **streak**: [`MoodStreak`](../../../mood/src/interfaces/MoodStreak.md) \| `null`

## Example

```ts
const { streak, refetch } = useMoodStreak()
return <p>{streak?.current} day streak 🔥</p>
```
