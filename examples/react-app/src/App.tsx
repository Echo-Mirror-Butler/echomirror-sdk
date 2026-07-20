import { useState } from 'react'
import {
  EchoMirrorProvider,
  useEchoMirrorClient,
  useMoodStreak,
} from '@echomirror/react'
import { connectFreighter, getBalance } from '@echomirror/stellar'
import { MoodWidget } from '@echomirror/widget'

function Dashboard() {
  const client = useEchoMirrorClient()
  const { streak } = useMoodStreak()

  return (
    <main
      style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: '32px 24px 64px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>EchoMirror SDK</h1>
        <p style={{ margin: '4px 0 0', color: '#64748b' }}>
          Mood logging, streaks, and Stellar rewards in React.
        </p>
      </header>

      {streak && (
        <p style={{ color: '#6366f1', fontWeight: 600, margin: 0 }}>
          🔥 {streak.current} day streak
          {!streak.isActiveToday && ' — log today to keep it!'}
        </p>
      )}

      {/* The production-ready, accessible mood widget. Styles self-inject. */}
      <MoodWidget client={client} />

      <WalletConnector />
    </main>
  )
}

function WalletConnector() {
  const client = useEchoMirrorClient()
  const [balance, setBalance] = useState<{ xlm: string; echo: string } | null>(null)
  const [connecting, setConnecting] = useState(false)

  async function handleConnect() {
    setConnecting(true)
    try {
      const wallet = await connectFreighter()
      const bal = await getBalance(client, wallet.publicKey)
      setBalance(bal)
    } catch {
      // Freighter not installed / user rejected — demo only.
    } finally {
      setConnecting(false)
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Stellar Wallet</h2>
      <button
        onClick={handleConnect}
        disabled={connecting}
        style={{
          padding: '10px 24px',
          background: '#0c1a2e',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {connecting ? 'Connecting…' : 'Connect Freighter'}
      </button>
      {balance && (
        <p style={{ margin: 0 }}>
          {balance.xlm} XLM &nbsp;•&nbsp; {balance.echo} ECHO
        </p>
      )}
    </section>
  )
}

export default function App() {
  const apiKey = import.meta.env.VITE_ECHOMIRROR_API_KEY ?? 'demo'
  return (
    <EchoMirrorProvider apiKey={apiKey}>
      <Dashboard />
    </EchoMirrorProvider>
  )
}
