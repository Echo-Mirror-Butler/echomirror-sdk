import * as vscode from 'vscode'

let statusBarItem: vscode.StatusBarItem
let balanceInterval: ReturnType<typeof setInterval> | undefined

export function activate(context: vscode.ExtensionContext) {
  // ── Status bar — live ECHO balance ──────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBarItem.command = 'echomirror.checkBalance'
  context.subscriptions.push(statusBarItem)
  updateStatusBar()

  const config = vscode.workspace.getConfiguration('echomirror')
  if (config.get<boolean>('showStatusBar') && config.get<string>('statusBarPublicKey')) {
    statusBarItem.show()
    startBalancePolling()
  }

  // ── Commands ─────────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('echomirror.checkBalance', async () => {
      const config = vscode.workspace.getConfiguration('echomirror')
      const publicKey = config.get<string>('statusBarPublicKey')
      if (!publicKey) {
        const key = await vscode.window.showInputBox({
          prompt: 'Enter a Stellar public key to check balance',
          placeHolder: 'G...',
          validateInput: (v) =>
            v.startsWith('G') && v.length === 56 ? null : 'Must be a valid Stellar G-address',
        })
        if (key) await showBalance(key)
        return
      }
      await showBalance(publicKey)
    }),

    vscode.commands.registerCommand('echomirror.validateAddress', async () => {
      const address = await vscode.window.showInputBox({
        prompt: 'Enter a Stellar address to validate',
        placeHolder: 'G...',
      })
      if (!address) return
      const valid = address.startsWith('G') && address.length === 56 && /^[A-Z2-7]+$/.test(address)
      vscode.window.showInformationMessage(
        valid
          ? `✅ Valid Stellar address: ${address}`
          : `❌ Invalid address — must start with G and be 56 alphanumeric characters`,
      )
    }),

    vscode.commands.registerCommand('echomirror.fundTestnet', async () => {
      const config = vscode.workspace.getConfiguration('echomirror')
      if (config.get<string>('network') !== 'testnet') {
        vscode.window.showErrorMessage('Friendbot funding is only available on testnet. Change echomirror.network to "testnet" first.')
        return
      }
      const address = await vscode.window.showInputBox({
        prompt: 'Enter the testnet account to fund (10,000 XLM)',
        placeHolder: 'G...',
      })
      if (!address) return

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Funding testnet account…' },
        async () => {
          try {
            const res = await fetch(`https://friendbot.stellar.org?addr=${address}`)
            if (res.ok) {
              vscode.window.showInformationMessage(`✅ Funded! ${address} now has 10,000 XLM on testnet.`)
            } else {
              vscode.window.showErrorMessage(`Friendbot error: ${res.status}`)
            }
          } catch (e) {
            vscode.window.showErrorMessage(`Network error: ${e}`)
          }
        },
      )
    }),

    vscode.commands.registerCommand('echomirror.insertMoodLogSnippet', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return

      const lang = editor.document.languageId
      const isDart = lang === 'dart'

      const snippet = isDart
        ? `final entry = await EchoMirror.instance.mood.log(\n  score: \${1:7},\n  note: '\${2:How are you feeling?}',\n  tags: ['\${3:work}'],\n);\n`
        : `const entry = await logMood(client, {\n  score: \${1:7},\n  note: '\${2:How are you feeling?}',\n  tags: ['\${3:work}'],\n})\n`

      editor.insertSnippet(new vscode.SnippetString(snippet))
    }),

    vscode.commands.registerCommand('echomirror.openSyncExplorer', () => {
      const panel = vscode.window.createWebviewPanel(
        'echomirrorSync',
        'EchoMirror Sync Explorer',
        vscode.ViewColumn.Beside,
        { enableScripts: true },
      )
      panel.webview.html = getSyncExplorerHtml()
    }),
  )

  // Watch config changes to restart/stop balance polling
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('echomirror')) {
        clearInterval(balanceInterval)
        const cfg = vscode.workspace.getConfiguration('echomirror')
        if (cfg.get<boolean>('showStatusBar') && cfg.get<string>('statusBarPublicKey')) {
          statusBarItem.show()
          startBalancePolling()
        } else {
          statusBarItem.hide()
        }
      }
    }),
  )
}

export function deactivate() {
  clearInterval(balanceInterval)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function showBalance(publicKey: string) {
  const config = vscode.workspace.getConfiguration('echomirror')
  const network = config.get<string>('network') ?? 'testnet'
  const horizon = network === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org'

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Fetching balance…' },
    async () => {
      try {
        const res = await fetch(`${horizon}/accounts/${publicKey}`)
        if (!res.ok) {
          vscode.window.showErrorMessage(`Account not found on ${network}`)
          return
        }
        const data = await res.json() as { balances: Array<{ asset_type: string; asset_code?: string; balance: string }> }
        const xlm = data.balances.find((b) => b.asset_type === 'native')?.balance ?? '0'
        const echo = data.balances.find((b) => b.asset_code === 'ECHO')?.balance ?? '0'
        vscode.window.showInformationMessage(`💰 ${xlm} XLM  •  ${echo} ECHO  (${network})`)
        statusBarItem.text = `$(symbol-misc) ${parseFloat(echo).toFixed(2)} ECHO`
        statusBarItem.tooltip = `${xlm} XLM • ${echo} ECHO on ${network}`
      } catch (e) {
        vscode.window.showErrorMessage(`Error fetching balance: ${e}`)
      }
    },
  )
}

function updateStatusBar() {
  statusBarItem.text = '$(symbol-misc) ECHO'
  statusBarItem.tooltip = 'EchoMirror SDK — click to check balance'
}

function startBalancePolling() {
  const config = vscode.workspace.getConfiguration('echomirror')
  const key = config.get<string>('statusBarPublicKey')
  if (!key) return
  showBalance(key)
  balanceInterval = setInterval(() => showBalance(key), 60_000)
}

function getSyncExplorerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>EchoMirror Sync Explorer</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
    h2 { color: var(--vscode-textLink-foreground); }
    .event { padding: 8px 12px; margin: 4px 0; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; font-size: 12px; }
    .event.ledger { border-left: 3px solid #6366f1; }
    .event.tx { border-left: 3px solid #16a34a; }
    .event.error { border-left: 3px solid #dc2626; }
    input { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px 10px; border-radius: 4px; width: 100%; box-sizing: border-box; }
    button { margin-top: 8px; padding: 6px 16px; background: #6366f1; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #4f46e5; }
    #events { margin-top: 16px; max-height: 400px; overflow-y: auto; }
    .status { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 8px; }
  </style>
</head>
<body>
  <h2>Blockchain Sync Explorer</h2>
  <p style="font-size:13px">Watch real-time Stellar transactions for any account.</p>
  <input id="address" placeholder="Stellar public key (G...)" />
  <button id="watch-btn">Watch Account</button>
  <button id="stop-btn" style="background:#6b7280;display:none">Stop</button>
  <p class="status" id="status">Not watching</p>
  <div id="events"></div>

  <script>
    let intervalId = null
    let cursor = 'now'
    let totalSeen = 0

    const addressEl = document.getElementById('address')
    const watchBtn = document.getElementById('watch-btn')
    const stopBtn = document.getElementById('stop-btn')
    const statusEl = document.getElementById('status')
    const eventsEl = document.getElementById('events')

    watchBtn.addEventListener('click', () => {
      const addr = addressEl.value.trim()
      if (!addr.startsWith('G') || addr.length !== 56) {
        statusEl.textContent = '❌ Invalid Stellar address'
        return
      }
      cursor = 'now'
      totalSeen = 0
      eventsEl.innerHTML = ''
      watchBtn.style.display = 'none'
      stopBtn.style.display = ''
      statusEl.textContent = 'Watching ' + addr.slice(0, 8) + '...'
      poll(addr)
      intervalId = setInterval(() => poll(addr), 5000)
    })

    stopBtn.addEventListener('click', () => {
      clearInterval(intervalId)
      watchBtn.style.display = ''
      stopBtn.style.display = 'none'
      statusEl.textContent = 'Stopped. Saw ' + totalSeen + ' ledger records.'
    })

    async function poll(addr) {
      try {
        const url = 'https://horizon-testnet.stellar.org/accounts/' + addr + '/transactions?limit=10&order=asc&cursor=' + cursor
        const res = await fetch(url)
        const data = await res.json()
        const records = data._embedded?.records ?? []
        for (const r of records) {
          totalSeen++
          cursor = r.paging_token
          const div = document.createElement('div')
          div.className = 'event ledger'
          div.textContent = '📦 Ledger ' + r.ledger + '  •  ' + r.hash.slice(0, 16) + '…  •  ' + new Date(r.created_at).toLocaleTimeString()
          eventsEl.prepend(div)
        }
        statusEl.textContent = 'Watching • ' + totalSeen + ' records seen'
      } catch (e) {
        const div = document.createElement('div')
        div.className = 'event error'
        div.textContent = '⚠️ ' + e.toString()
        eventsEl.prepend(div)
      }
    }
  </script>
</body>
</html>`
}
