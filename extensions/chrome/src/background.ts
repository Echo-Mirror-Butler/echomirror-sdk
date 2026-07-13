// Background service worker — handles Stellar transaction watching

interface WatchState {
  publicKey: string
  network: string
  cursor: string
  totalSeen: number
}

let watchState: WatchState | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_WATCH') {
    startWatching(msg.publicKey, msg.network)
  } else if (msg.type === 'STOP_WATCH') {
    stopWatching()
  }
})

function startWatching(publicKey: string, network: string) {
  stopWatching()
  watchState = { publicKey, network, cursor: 'now', totalSeen: 0 }
  poll()
  pollInterval = setInterval(poll, 5_000)
}

function stopWatching() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  watchState = null
}

async function poll() {
  if (!watchState) return
  const { publicKey, network, cursor } = watchState
  const horizon = network === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org'

  try {
    const res = await fetch(
      `${horizon}/accounts/${publicKey}/transactions?limit=10&order=asc&cursor=${cursor}`,
    )
    if (!res.ok) return

    const data = await res.json()
    const records: Array<{ hash: string; ledger: number; paging_token: string; memo?: string }> =
      data._embedded?.records ?? []

    for (const r of records) {
      watchState.totalSeen++
      watchState.cursor = r.paging_token

      chrome.notifications.create(`echo-tx-${r.hash}`, {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'EchoMirror: Stellar Transaction',
        message: `Ledger ${r.ledger} • ${r.hash.slice(0, 16)}…${r.memo ? ` • ${r.memo}` : ''}`,
        priority: 1,
      })
    }
  } catch {
    // Network errors during polling are silently ignored
  }
}
