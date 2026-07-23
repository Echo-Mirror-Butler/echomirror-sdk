# Function: submitTransaction()

> **submitTransaction**(`client`, `signedXdr`): `Promise`\<[`StellarTransaction`](../interfaces/StellarTransaction.md)\>

Defined in: [packages/js/stellar/src/index.ts:106](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/stellar/src/index.ts#L106)

Submit a pre-signed XDR transaction (server-side or custom signing).

## Parameters

### client

`EchoMirrorClient`

### signedXdr

`string`

## Returns

`Promise`\<[`StellarTransaction`](../interfaces/StellarTransaction.md)\>
