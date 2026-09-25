---
sidebar_position: 1
---

# JavaScript / TypeScript Quickstart

## Supported Node.js versions

Requires **Node.js ≥ 20**. If you also install `@echomirror/stellar`, that
package specifically requires **Node.js ≥ 22.12** — its dependency
`@stellar/stellar-sdk@17` needs that version, and its CJS build imports an
ESM-only package, so `require('@echomirror/stellar')` throws
`ERR_REQUIRE_ESM` on Node 20. Every other `@echomirror/*` package works on
Node 20.

## Install

```bash
npm install @echomirror/core
```

## Initialize the client

```typescript
import { EchoMirrorClient } from '@echomirror/core'

const client = new EchoMirrorClient({
  apiKey: process.env.ECHOMIRROR_API_KEY,
})
```

## Log a mood entry

```typescript
import { logMood } from '@echomirror/mood'

const entry = await logMood(client, {
  mood: 'grateful',
  intensity: 8,
  note: 'Shipped a feature I am proud of',
})

console.log(entry.streak) // current mood-logging streak
```

## Connect a Stellar wallet and send an echo

```typescript
import { connectFreighter, sendEcho } from '@echomirror/stellar'

const wallet = await connectFreighter()

const transfer = await sendEcho(client, {
  from: wallet.publicKey,
  to: 'GRECIPIENT_PUBLIC_KEY',
  amount: '5',
  memo: 'thanks for the code review ??',
})
```

## Next steps

- [React Quickstart](./react) if you're building a React app
- [Core Concepts](../core-concepts) to understand how the pieces fit together
- [Architecture and package guide](../architecture) for the full typed API surface
