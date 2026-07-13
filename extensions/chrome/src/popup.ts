// EchoMirror SDK Companion — popup script

interface StorageData {
  publicKey?: string
  network?: string
  apiKey?: string
  balance?: { xlm: string; echo: string; ts: number }
}

async function load(): Promise<StorageData> {
  return new Promise((resolve) => chrome.storage.local.get(null, resolve as (items: { [key: string]: unknown }) => void))
}

async function save(data: Partial<StorageData>) {
  return new Promise<void>((resolve) => chrome.storage.local.set(data, resolve))
}

async function fetchBalance(publicKey: string, network: string) {
  const horizon = network === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org'

  const res = await fetch(`${horizon}/accounts/${publicKey}`)
  if (!res.ok) return null
  const data = await res.json()
  const xlm = data.balances.find((b: { asset_type: string }) => b.asset_type === 'native')?.balance ?? '0'
  const echo = data.balances.find((b: { asset_code?: string }) => b.asset_code === 'ECHO')?.balance ?? '0'
  return { xlm, echo, ts: Date.now() }
}

document.addEventListener('DOMContentLoaded', async () => {
  const data = await load()

  const keyInput = document.getElementById('public-key') as HTMLInputElement
  const networkSelect = document.getElementById('network') as HTMLSelectElement
  const checkBtn = document.getElementById('check-btn') as HTMLButtonElement
  const injectBtn = document.getElementById('inject-btn') as HTMLButtonElement
  const watchBtn = document.getElementById('watch-btn') as HTMLButtonElement
  const balanceEl = document.getElementById('balance') as HTMLDivElement
  const statusEl = document.getElementById('status') as HTMLParagraphElement

  keyInput.value = data.publicKey ?? ''
  networkSelect.value = data.network ?? 'testnet'

  if (data.balance && Date.now() - data.balance.ts < 60_000) {
    balanceEl.textContent = `${parseFloat(data.balance.xlm).toFixed(4)} XLM  •  ${parseFloat(data.balance.echo).toFixed(2)} ECHO`
  }

  checkBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim()
    const network = networkSelect.value
    if (!key.startsWith('G') || key.length !== 56) {
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

  // Inject the EchoMirror mood widget into the current tab
  injectBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab.id) return
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectMoodWidget,
    })
    statusEl.textContent = '✅ Mood widget injected!'
  })

  // Start watching transactions in the background
  watchBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim()
    const network = networkSelect.value
    if (!key) return
    await save({ publicKey: key, network })
    chrome.runtime.sendMessage({ type: 'START_WATCH', publicKey: key, network })
    statusEl.textContent = `Watching ${key.slice(0, 8)}…`
  })
})

function injectMoodWidget() {
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

  const btn = document.createElement('button')
  btn.style.cssText = `
    width: 52px; height: 52px; border-radius: 50%; background: #6366f1;
    color: white; border: none; cursor: pointer; font-size: 22px;
    box-shadow: 0 4px 16px rgba(99,102,241,0.5);
  `
  btn.textContent = '🪞'
  btn.title = 'Log your mood with EchoMirror'

  btn.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none'
  })

  const emojis = ['😫','😟','😕','😐','🙂','😊','😄','😁','🌟','🚀']
  form.querySelector('#em-score')!.addEventListener('input', (e) => {
    const v = parseInt((e.target as HTMLInputElement).value)
    ;(form.querySelector('#em-emoji') as HTMLElement).textContent = emojis[v - 1]
  })

  form.querySelector('#em-log')!.addEventListener('click', () => {
    ;(form.querySelector('#em-result') as HTMLElement).textContent = '✅ Mood logged!'
    setTimeout(() => { form.style.display = 'none' }, 1200)
  })

  widget.appendChild(form)
  widget.appendChild(btn)
  document.body.appendChild(widget)
}
