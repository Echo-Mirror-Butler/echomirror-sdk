import { useState } from 'react'
import { EchoMirrorProvider, useProfile, useMoodStreak } from '@echomirror/react'
import { logMood } from '@echomirror/mood'
import { connectFreighter, getBalance } from '@echomirror/stellar'
import { useEchoMirrorClient } from '@echomirror/react'

function MoodLogger() {
  const client = useEchoMirrorClient()
  const { streak } = useMoodStreak()
  const [score, setScore] = useState(7)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastEntry, setLastEntry] = useState<{ score: number } | null>(null)

  async function handleLog() {
    setLoading(true)
    try {
      const entry = await logMood(client, { score: score as 1, note, tags: [] })
      setLastEntry(entry)
      setNote('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#0c1a2e' }}>EchoMirror SDK — React Example</h1>

      {streak && (
        <p style={{ color: '#6366f1', fontWeight: 600 }}>
          🔥 {streak.current} day streak
          {!streak.isActiveToday && ' — log today to keep it!'}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <label>Mood score: {score}/10</label>
        <input
          type="range"
          min={1}
          max={10}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          style={{ width: '100%', marginTop: 8 }}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <textarea
          placeholder="How are you feeling? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: '100%', height: 80, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
      </div>

      <button
        onClick={handleLog}
        disabled={loading}
        style={{
          marginTop: 16,
          padding: '10px 24px',
          background: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        {loading ? 'Logging…' : 'Log Mood'}
      </button>

      {lastEntry && (
        <p style={{ marginTop: 16, color: '#16a34a' }}>
          Mood logged: {lastEntry.score}/10
        </p>
      )}
    </div>
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
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div style={{ padding: '0 24px', maxWidth: 480, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Stellar Wallet</h2>
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
        }}
      >
        {connecting ? 'Connecting…' : 'Connect Freighter'}
      </button>
      {balance && (
        <p style={{ marginTop: 16 }}>
          {balance.xlm} XLM &nbsp;•&nbsp; {balance.echo} ECHO
        </p>
      )}
    </div>
  )
}

export default function App() {
  return (
    <EchoMirrorProvider apiKey={import.meta.env.VITE_ECHOMIRROR_API_KEY ?? 'demo'}>
      <MoodLogger />
      <WalletConnector />
    </EchoMirrorProvider>
  )
}
