import { useState } from 'react'
import { connectWallet, LedgerWalletAdapter } from '@echomirror/stellar'

/**
 * Soroban demo — placeholder pending #103 (Soroban invocation support).
 *
 * Once #103 lands, this will demonstrate:
 * - Wallet connection (including Ledger hardware wallet)
 * - Invoking a deployed Soroban contract
 * - Reading contract state
 * - Handling typed SDK errors
 */

// TODO(#103): Replace with a real deployed counter contract on testnet
const CONTRACT_ID = 'CONTRACT_ID_PLACEHOLDER'

export default function App() {
  const [address, setAddress] = useState<string>('')
  const [error, setError] = useState<string>('')

  async function handleConnect() {
    try {
      setError('')
      const { connection } = await connectWallet({ network: 'testnet' })
      setAddress(connection.publicKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 600, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Soroban Demo</h1>
      <p>This example demonstrates Soroban smart-contract interaction using the EchoMirror SDK.</p>
      <p style={{ color: '#e67e22', fontWeight: 600 }}>
        Blocked on #103 — Soroban invocation support has not landed yet.
        Contract calls below are placeholders.
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2>1. Connect Wallet</h2>
        <button onClick={handleConnect}>Connect Wallet</button>
        {address && <p>Connected: {address}</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>2. Invoke Contract</h2>
        <p>Contract: <code>{CONTRACT_ID}</code></p>
        <button disabled>Invoke (blocked on #103)</button>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>3. Read Contract State</h2>
        <button disabled>Read (blocked on #103)</button>
      </section>
    </main>
  )
}
