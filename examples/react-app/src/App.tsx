import { useEffect, useState } from 'react'
import { EchoMirrorProvider, useProfile, useMoodStreak } from '@echomirror/react'
import { logMood } from '@echomirror/mood'
import { connectFreighter, getBalance } from '@echomirror/stellar'
import { useEchoMirrorClient } from '@echomirror/react'
import { init as initWasm, hashPublicKey, MoodBuffer } from '@echomirror/wasm'
import { useGlobalFeed, useLeaderboard } from '@echomirror/social'

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

function GlobalFeedView() {
  const client = useEchoMirrorClient()
  const { entries, isLoading, fetchMore, hasMore, refresh } = useGlobalFeed(client)

  return (
    <div style={{ padding: '0 24px', maxWidth: 480, margin: '24px auto 0', fontFamily: 'sans-serif' }}>
      <h2>@echomirror/social — Global Feed</h2>
      <button onClick={refresh} disabled={isLoading} style={{ marginBottom: 12, padding: '6px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        {isLoading ? 'Loading…' : 'Refresh'}
      </button>
      {entries.map((entry) => (
        <div key={entry.id} style={{ padding: '8px 12px', marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Score: {entry.score}/10</p>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            {entry.tags.join(', ')} {entry.country ? `• ${entry.country}` : ''}
          </p>
        </div>
      ))}
      {hasMore && (
        <button onClick={fetchMore} disabled={isLoading} style={{ padding: '8px 20px', background: '#0c1a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Load More
        </button>
      )}
    </div>
  )
}

function LeaderboardView() {
  const client = useEchoMirrorClient()
  const [window, setWindow] = useState<'daily' | 'weekly' | 'all-time'>('weekly')
  const { entries, isLoading, refresh } = useLeaderboard(client, window)

  return (
    <div style={{ padding: '0 24px', maxWidth: 480, margin: '24px auto 0', fontFamily: 'sans-serif' }}>
      <h2>@echomirror/social — Leaderboard</h2>
      <div style={{ marginBottom: 12 }}>
        {(['daily', 'weekly', 'all-time'] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            style={{
              padding: '4px 12px',
              marginRight: 8,
              background: window === w ? '#6366f1' : '#e5e7eb',
              color: window === w ? 'white' : '#374151',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {w}
          </button>
        ))}
        <button onClick={refresh} disabled={isLoading} style={{ padding: '4px 12px', background: '#0c1a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          ↻
        </button>
      </div>
      {entries.map((entry) => (
        <div key={entry.userId} style={{ padding: '8px 12px', marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>#{entry.rank} {entry.displayName}</p>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            Score: {entry.weeklyScore} • Streak: {entry.streak} days
          </p>
        </div>
      ))}
    </div>
  )
}

function WasmInsights() {
  const [ready, setReady] = useState(false)
  const [anonymizedId, setAnonymizedId] = useState<string | null>(null)
  const [localAverage, setLocalAverage] = useState<number | null>(null)

  // init() fetches + instantiates the .wasm binary once per page load.
  useEffect(() => {
    initWasm().then(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!ready) return
    setAnonymizedId(hashPublicKey('GDEMO...PUBLICKEY').slice(0, 16))

    // MoodBuffer owns wasm-side memory — free() it once you're done with
    // it (here: synchronously, since we only need the average).
    const buffer = new MoodBuffer()
    try {
      for (const score of [7, 8, 6, 9, 7]) buffer.push(score)
      setLocalAverage(buffer.average())
    } finally {
      buffer.free()
    }
  }, [ready])

  if (!ready) return null

  return (
    <div style={{ padding: '0 24px', maxWidth: 480, margin: '24px auto 0', fontFamily: 'sans-serif' }}>
      <h2>@echomirror/wasm — client-side helpers</h2>
      <p style={{ color: '#16a34a' }}>Anonymized wallet id: {anonymizedId}…</p>
      <p style={{ color: '#16a34a' }}>Local 5-entry average (computed in wasm): {localAverage?.toFixed(1)}/10</p>
    </div>
  )
}

export default function App() {
  return (
    <EchoMirrorProvider apiKey={import.meta.env.VITE_ECHOMIRROR_API_KEY ?? 'demo'}>
      <MoodLogger />
      <WalletConnector />
      <GlobalFeedView />
      <LeaderboardView />
      <WasmInsights />
    </EchoMirrorProvider>
  )
}
