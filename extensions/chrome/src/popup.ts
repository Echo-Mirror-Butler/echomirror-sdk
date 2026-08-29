// EchoMirror SDK Companion — popup script

export interface StorageData {
  publicKey?: string
  network?: string
  apiKey?: string
  balance?: { xlm: string; echo: string; ts: number }
}

export async function load(): Promise<StorageData> {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => resolve(items as StorageData))
  })
}

export async function save(data: Partial<StorageData>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve))
}

export function isValidStellarAddress(publicKey: string): boolean {
  return publicKey.startsWith('G') && publicKey.length === 56
}

export async function fetchBalance(publicKey: string, network: string) {
  const horizon = network === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org'

  const res = await fetch(`${horizon}/accounts/${publicKey}`)
  if (!res.ok) return null
  const data = await res.json()
  const xlm = data.balances.find((balance: { asset_type: string }) => balance.asset_type === 'native')?.balance ?? '0'
  const echo = data.balances.find((balance: { asset_code?: string }) => balance.asset_code === 'ECHO')?.balance ?? '0'
  return { xlm, echo, ts: Date.now() }
}

/** Wire the popup DOM to storage, Horizon balance lookups, and background watch messages. */
export async function initializePopup() {
  const data = await load()

  const keyInput = document.getElementById('public-key') as HTMLInputElement | null
  const networkSelect = document.getElementById('network') as HTMLSelectElement | null
  const checkBtn = document.getElementById('check-btn') as HTMLButtonElement | null
  const injectBtn = document.getElementById('inject-btn') as HTMLButtonElement | null
  const watchBtn = document.getElementById('watch-btn') as HTMLButtonElement | null
  const balanceEl = document.getElementById('balance') as HTMLDivElement | null
  const statusEl = document.getElementById('status') as HTMLParagraphElement | null

  if (!keyInput || !networkSelect || !checkBtn || !injectBtn || !watchBtn || !balanceEl || !statusEl) {
    return
  }

  keyInput.value = data.publicKey ?? ''
  networkSelect.value = data.network ?? 'testnet'

  if (data.balance && Date.now() - data.balance.ts < 60_000) {
    balanceEl.textContent = `${parseFloat(data.balance.xlm).toFixed(4)} XLM  •  ${parseFloat(data.balance.echo).toFixed(2)} ECHO`
  }

  checkBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim()
    const network = networkSelect.value
    if (!isValidStellarAddress(key)) {
      statusEl.textContent = '❌ Invalid Stellar address'
      return
    }
    await save({ publicKey: key, network })
    checkBtn.disabled = true
    checkBtn.textContent = 'Loading…'
    try {
      const balance = await fetchBalance(key, network)
      if (balance) {
        await save({ balance })
        balanceEl.textContent = `${parseFloat(balance.xlm).toFixed(4)} XLM  •  ${parseFloat(balance.echo).toFixed(2)} ECHO`
        statusEl.textContent = `✅ ${network}`
      } else {
        statusEl.textContent = '❌ Account not found'
      }
    } catch {
      statusEl.textContent = '❌ Network error'
    } finally {
      checkBtn.disabled = false
      checkBtn.textContent = 'Check Balance'
    }
  })

  injectBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab.id) return
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectMoodWidget,
    })
    statusEl.textContent = '✅ Mood widget injected!'
  })

  watchBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim()
    const network = networkSelect.value
    if (!key) return
    await save({ publicKey: key, network })
    chrome.runtime.sendMessage({ type: 'START_WATCH', publicKey: key, network })
    statusEl.textContent = `Watching ${key.slice(0, 8)}…`
  })
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    void initializePopup()
  })
}

/** Inject the lightweight mood widget into the active page. */
export function injectMoodWidget() {
  if (document.getElementById('echomirror-widget')) return

  const widget = document.createElement('div')
  widget.id = 'echomirror-widget'
  widget.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 999999;
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    font-family: system-ui, sans-serif;
  `

  const form = document.createElement('div')
  form.style.cssText = `
    background: #0c1a2e; color: white; border-radius: 16px;
    padding: 20px; width: 260px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    display: none;
  `
  form.innerHTML = `
    <p style="margin:0 0 12px;font-weight:600;font-size:14px">How are you feeling?</p>
    <input type="range" min="1" max="10" value="7" id="em-score"
      style="width:100%;accent-color:#6366f1" />
    <p style="text-align:center;font-size:24px;margin:8px 0" id="em-emoji">😊</p>
    <button id="em-log" style="width:100%;padding:8px;background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">Log Mood</button>
    <p id="em-result" style="text-align:center;font-size:12px;color:#86efac;margin:8px 0 0"></p>
  `

  const button = document.createElement('button')
  button.style.cssText = `
    width: 52px; height: 52px; border-radius: 50%; background: #6366f1;
    color: white; border: none; cursor: pointer; font-size: 22px;
    box-shadow: 0 4px 16px rgba(99,102,241,0.5);
  `
  button.textContent = '🪞'
  button.title = 'Log your mood with EchoMirror'

  button.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none'
  })

  const emojis = ['😫', '😟', '😕', '😐', '🙂', '😊', '😄', '😁', '🌟', '🚀']
  form.querySelector('#em-score')!.addEventListener('input', (event) => {
    const value = parseInt((event.target as HTMLInputElement).value, 10)
    ;(form.querySelector('#em-emoji') as HTMLElement).textContent = emojis[value - 1]
  })

  form.querySelector('#em-log')!.addEventListener('click', () => {
    ;(form.querySelector('#em-result') as HTMLElement).textContent = '✅ Mood logged!'
    setTimeout(() => {
      form.style.display = 'none'
    }, 1200)
  })

  widget.appendChild(form)
  widget.appendChild(button)
  document.body.appendChild(widget)
}