# Function: getBalance()

> **getBalance**(`client`, `publicKey`): `Promise`\<[`StellarBalance`](../interfaces/StellarBalance.md)\>

Defined in: [packages/js/stellar/src/index.ts:59](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/stellar/src/index.ts#L59)

Get the XLM and ECHO token balance for a Stellar public key.

## Parameters

### client

`EchoMirrorClient`

### publicKey

`string`

## Returns

`Promise`\<[`StellarBalance`](../interfaces/StellarBalance.md)\>

## Example

```ts
const balance = await getBalance(client, wallet.publicKey)
console.log(`${balance.xlm} XLM  •  ${balance.echo} ECHO`)
```
