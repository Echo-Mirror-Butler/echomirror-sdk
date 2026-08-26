# Soroban Demo

Minimal example demonstrating Soroban smart-contract interaction using the EchoMirror SDK.

## Status

**Blocked on #103** (Soroban invocation support). This example will be completed once Soroban contract invocation lands in `@echomirror/stellar`.

## What this demo will show

1. Connecting a Stellar wallet (Freighter, xBull, Albedo, or Ledger)
2. Invoking a simple deployed Soroban contract on testnet
3. Reading contract state without signing
4. Handling typed error cases from the SDK

## Running

```bash
npm install
npm run dev
```

Point the example at a different contract ID by editing the `CONTRACT_ID` constant in `src/App.tsx`.

## Testnet contract

The demo targets a minimal counter contract deployed on Stellar testnet. The contract ID is configured in `src/App.tsx`.
