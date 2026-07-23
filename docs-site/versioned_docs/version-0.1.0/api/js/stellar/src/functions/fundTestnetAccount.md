# Function: fundTestnetAccount()

> **fundTestnetAccount**(`client`, `publicKey`): `Promise`\<`void`\>

Defined in: [packages/js/stellar/src/index.ts:139](https://github.com/karanjadavi/echomirror-sdk/blob/1e86960804b3b9d6c6107f0f78b2c968a63ffa5f/packages/js/stellar/src/index.ts#L139)

Fund a testnet account using Stellar Friendbot.
Only works when the client is configured with network: 'testnet'.

## Parameters

### client

`EchoMirrorClient`

### publicKey

`string`

## Returns

`Promise`\<`void`\>

## Example

```ts
// Get 10,000 XLM on testnet instantly for development
await fundTestnetAccount(client, wallet.publicKey)
```
