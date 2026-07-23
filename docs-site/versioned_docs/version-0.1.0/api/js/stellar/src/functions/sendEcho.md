# Function: sendEcho()

> **sendEcho**(`client`, `transfer`): `Promise`\<[`StellarTransaction`](../interfaces/StellarTransaction.md)\>

Defined in: [packages/js/stellar/src/index.ts:80](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/stellar/src/index.ts#L80)

Send ECHO tokens to any Stellar address.
The SDK builds the transaction — you sign with Freighter (browser) or a secret key (server).

## Parameters

### client

`EchoMirrorClient`

### transfer

[`EchoTransfer`](../interfaces/EchoTransfer.md)

## Returns

`Promise`\<[`StellarTransaction`](../interfaces/StellarTransaction.md)\>

## Example

```ts
await sendEcho(client, {
  from: wallet.publicKey,
  to: 'GFRIENDPUBLICKEY',
  amount: 5,
  memo: 'Great energy today ✨',
})
```
