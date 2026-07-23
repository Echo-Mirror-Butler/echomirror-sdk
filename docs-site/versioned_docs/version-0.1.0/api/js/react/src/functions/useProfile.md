# Function: useProfile()

> **useProfile**(): `object`

Defined in: [packages/js/react/src/index.tsx:91](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/react/src/index.tsx#L91)

Get the authenticated user's profile.

## Returns

`object`

### error

> **error**: `Error` \| `null`

### isLoading

> **isLoading**: `boolean`

### profile

> **profile**: `UserProfile` \| `null`

## Example

```ts
const { profile, isLoading } = useProfile()
```
