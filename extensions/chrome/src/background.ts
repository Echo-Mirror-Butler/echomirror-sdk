// Background service worker — handles Stellar transaction watching

interface WatchState {
  publicKey: string
  network: string
  cursor: string
  totalSeen: number
}

type WatchMessage =
  | { type: 'START_WATCH'; publicKey: string; network: string }
  | { type: 'STOP_WATCH' }
  | { type?: string; publicKey?: unknown; network?: unknown }

let watchState: WatchState | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null

/** Start polling an account's Horizon transaction feed. */
export function startWatching(publicKey: string, network: string) {
  stopWatching()
  watchState = { publicKey, network, cursor: 'now', totalSeen: 0 }
  void poll()
  pollInterval = setInterval(() => void poll(), 5_000)
}

/** Stop the active polling loop and discard its in-memory cursor. */
export function stopWatching() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  watchState = null
}

/** Poll Horizon once and create a notification for each new transaction. */
export async function poll() {
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

    for (const record of records) {
      // A STOP_WATCH message may arrive while fetch is in flight.
      if (!watchState) return
      watchState.totalSeen++
      watchState.cursor = record.paging_token

      chrome.notifications.create(`echo-tx-${record.hash}`, {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'EchoMirror: Stellar Transaction',
        message: `Ledger ${record.ledger} • ${record.hash.slice(0, 16)}…${record.memo ? ` • ${record.memo}` : ''}`,
        priority: 1,
      })
    }
  } catch {
    // Network errors during background polling are intentionally non-fatal.
  }
}

/** Register the MV3 message bridge used by the popup. */
export function registerMessageListener() {
  chrome.runtime.onMessage.addListener((message: WatchMessage) => {
    if (
      message.type === 'START_WATCH' &&
      typeof message.publicKey === 'string' &&
      typeof message.network === 'string'
    ) {
      startWatching(message.publicKey, message.network)
    } else if (message.type === 'STOP_WATCH') {
      stopWatching()
    }
  })
}

registerMessageListener()
