# Soroban Demo

This example demonstrates the current `@echomirror/stellar` wallet API. It
connects a testnet wallet; contract invocation and state-reading controls are
intentionally disabled because the package does not yet expose Soroban
invocation support.

## Run and build

From this directory:

```bash
npm install
npm run dev
```

To verify the production build and TypeScript types:

```bash
npm run build
```

Install a supported browser wallet and connect it to Stellar testnet to try the
wallet flow. Contract invocation is not currently implemented; the placeholder
contract ID is not deployed or used by the wallet connection.
