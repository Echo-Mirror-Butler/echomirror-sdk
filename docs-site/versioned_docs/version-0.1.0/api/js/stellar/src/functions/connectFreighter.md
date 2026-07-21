# Function: connectFreighter()

> **connectFreighter**(): `Promise`\<[`FreighterConnection`](../interfaces/FreighterConnection.md)\>

Defined in: [packages/js/stellar/src/index.ts:19](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/stellar/src/index.ts#L19)

Prompt the user to connect their Freighter wallet.
Only works in browser environments with the Freighter extension installed.

## Returns

`Promise`\<[`FreighterConnection`](../interfaces/FreighterConnection.md)\>

## Example

```ts
const wallet = await connectFreighter()
console.log(wallet.publicKey) // G...
```
