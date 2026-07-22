# Function: getTransactionHistory()

> **getTransactionHistory**(`client`, `publicKey`, `options?`): `Promise`\<\{ `cursor`: `string` \| `null`; `transactions`: [`StellarTransaction`](../interfaces/StellarTransaction.md)[]; \}\>

Defined in: [packages/js/stellar/src/index.ts:118](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/stellar/src/index.ts#L118)

Get paginated Stellar transaction history for a public key.

## Parameters

### client

`EchoMirrorClient`

### publicKey

`string`

### options?

#### cursor?

`string`

#### limit?

`number`

## Returns

`Promise`\<\{ `cursor`: `string` \| `null`; `transactions`: [`StellarTransaction`](../interfaces/StellarTransaction.md)[]; \}\>
