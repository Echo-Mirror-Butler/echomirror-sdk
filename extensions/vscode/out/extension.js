"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));

// ../../packages/js/core/dist/errors.js
var EchoMirrorError = class extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "EchoMirrorError";
  }
};
var AuthError = class extends EchoMirrorError {
  constructor(message = "Authentication failed") {
    super(message, 401);
    this.name = "AuthError";
  }
};
var NetworkError = class extends EchoMirrorError {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
};
var RateLimitError = class extends EchoMirrorError {
  constructor(retryAfterSeconds) {
    super(`Rate limit exceeded. Retry after ${retryAfterSeconds}s`, 429);
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = "RateLimitError";
  }
};

// ../../packages/js/core/dist/client.js
var DEFAULT_BASE_URL = "https://api.echomirror.dev/v1";
var DEFAULT_TIMEOUT = 1e4;
var EchoMirrorClient = class {
  constructor(config) {
    this._handlers = /* @__PURE__ */ new Map();
    this._authToken = null;
    this.config = {
      baseUrl: DEFAULT_BASE_URL,
      network: "mainnet",
      timeout: DEFAULT_TIMEOUT,
      ...config
    };
  }
  // ── HTTP ────────────────────────────────────────────────────────────────────
  async request(method, path, body) {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout);
    const headers = {
      "x-api-key": this.config.apiKey,
      "x-echomirror-network": this.config.network
    };
    if (body)
      headers["content-type"] = "application/json";
    if (this._authToken)
      headers["authorization"] = `Bearer ${this._authToken}`;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new NetworkError(`Request timed out after ${this.config.timeout}ms`);
      }
      throw new NetworkError(`Network error: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401)
      throw new AuthError("Invalid or expired API key");
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      throw new RateLimitError(retryAfter ? parseInt(retryAfter) : 60);
    }
    if (!res.ok) {
      const body2 = await res.json().catch(() => ({}));
      throw new EchoMirrorError(body2.message ?? `HTTP ${res.status}`, res.status);
    }
    if (res.status === 204)
      return void 0;
    return res.json();
  }
  // ── Auth token ──────────────────────────────────────────────────────────────
  setAuthToken(token) {
    this._authToken = token;
  }
  // ── Event bus ───────────────────────────────────────────────────────────────
  on(eventType, handler) {
    if (!this._handlers.has(eventType)) {
      this._handlers.set(eventType, /* @__PURE__ */ new Set());
    }
    this._handlers.get(eventType).add(handler);
    return () => this.off(eventType, handler);
  }
  off(eventType, handler) {
    this._handlers.get(eventType)?.delete(handler);
  }
  emit(event) {
    this._handlers.get(event.type)?.forEach((h) => h(event));
  }
};

// ../../packages/js/mood/dist/index.js
async function logMood(client, payload) {
  const entry = await client.request("POST", "/mood/entries", payload);
  client.emit({ type: "mood:logged", entry });
  return entry;
}
async function getMoodStreak(client) {
  return client.request("GET", "/mood/streak");
}

// src/extension.ts
var statusBarItem;
var moodStatusBarItem;
var balanceInterval;
function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "echomirror.checkBalance";
  context.subscriptions.push(statusBarItem);
  updateStatusBar();
  const config = vscode.workspace.getConfiguration("echomirror");
  if (config.get("showStatusBar") && config.get("statusBarPublicKey")) {
    statusBarItem.show();
    startBalancePolling();
  }
  moodStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  moodStatusBarItem.command = "echomirror.logMood";
  moodStatusBarItem.text = "$(pulse) Log Mood";
  moodStatusBarItem.tooltip = "EchoMirror SDK \u2014 click to log your mood";
  moodStatusBarItem.show();
  context.subscriptions.push(moodStatusBarItem);
  async function getClient() {
    const apiKey = await context.secrets.get("echomirror.apiKey");
    if (!apiKey) {
      vscode.window.showErrorMessage("Not signed in to EchoMirror. Please sign in first.");
      vscode.commands.executeCommand("echomirror.signIn");
      return void 0;
    }
    const config2 = vscode.workspace.getConfiguration("echomirror");
    const network = config2.get("network") ?? "testnet";
    return new EchoMirrorClient({ apiKey, network });
  }
  context.subscriptions.push(
    vscode.commands.registerCommand("echomirror.checkBalance", async () => {
      const config2 = vscode.workspace.getConfiguration("echomirror");
      const publicKey = config2.get("statusBarPublicKey");
      if (!publicKey) {
        const key = await vscode.window.showInputBox({
          prompt: "Enter a Stellar public key to check balance",
          placeHolder: "G...",
          validateInput: (v) => v.startsWith("G") && v.length === 56 ? null : "Must be a valid Stellar G-address"
        });
        if (key)
          await showBalance(key);
        return;
      }
      await showBalance(publicKey);
    }),
    vscode.commands.registerCommand("echomirror.validateAddress", async () => {
      const address = await vscode.window.showInputBox({
        prompt: "Enter a Stellar address to validate",
        placeHolder: "G..."
      });
      if (!address)
        return;
      const valid = address.startsWith("G") && address.length === 56 && /^[A-Z2-7]+$/.test(address);
      vscode.window.showInformationMessage(
        valid ? `\u2705 Valid Stellar address: ${address}` : `\u274C Invalid address \u2014 must start with G and be 56 alphanumeric characters`
      );
    }),
    vscode.commands.registerCommand("echomirror.fundTestnet", async () => {
      const config2 = vscode.workspace.getConfiguration("echomirror");
      if (config2.get("network") !== "testnet") {
        vscode.window.showErrorMessage('Friendbot funding is only available on testnet. Change echomirror.network to "testnet" first.');
        return;
      }
      const address = await vscode.window.showInputBox({
        prompt: "Enter the testnet account to fund (10,000 XLM)",
        placeHolder: "G..."
      });
      if (!address)
        return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Funding testnet account\u2026" },
        async () => {
          try {
            const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
            if (res.ok) {
              vscode.window.showInformationMessage(`\u2705 Funded! ${address} now has 10,000 XLM on testnet.`);
            } else {
              vscode.window.showErrorMessage(`Friendbot error: ${res.status}`);
            }
          } catch (e) {
            vscode.window.showErrorMessage(`Network error: ${e}`);
          }
        }
      );
    }),
    vscode.commands.registerCommand("echomirror.insertMoodLogSnippet", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor)
        return;
      const lang = editor.document.languageId;
      const isDart = lang === "dart";
      const snippet = isDart ? `final entry = await EchoMirror.instance.mood.log(
  score: \${1:7},
  note: '\${2:How are you feeling?}',
  tags: ['\${3:work}'],
);
` : `const entry = await logMood(client, {
  score: \${1:7},
  note: '\${2:How are you feeling?}',
  tags: ['\${3:work}'],
})
`;
      editor.insertSnippet(new vscode.SnippetString(snippet));
    }),
    vscode.commands.registerCommand("echomirror.openSyncExplorer", () => {
      const panel = vscode.window.createWebviewPanel(
        "echomirrorSync",
        "EchoMirror Sync Explorer",
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );
      panel.webview.html = getSyncExplorerHtml();
    }),
    vscode.commands.registerCommand("echomirror.signIn", async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your EchoMirror API Key",
        password: true,
        placeHolder: "em_live_...",
        ignoreFocusOut: true
      });
      if (apiKey) {
        await context.secrets.store("echomirror.apiKey", apiKey);
        vscode.window.showInformationMessage("Successfully signed in to EchoMirror.");
      }
    }),
    vscode.commands.registerCommand("echomirror.signOut", async () => {
      await context.secrets.delete("echomirror.apiKey");
      vscode.window.showInformationMessage("Signed out of EchoMirror.");
      moodStatusBarItem.text = "$(pulse) Log Mood";
    }),
    vscode.commands.registerCommand("echomirror.logMood", async () => {
      const client = await getClient();
      if (!client)
        return;
      const scoreStr = await vscode.window.showQuickPick(
        ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
        { placeHolder: "How are you feeling today? (Score 1-10)" }
      );
      if (!scoreStr)
        return;
      const score = parseInt(scoreStr);
      const note = await vscode.window.showInputBox({
        prompt: "Add an optional note about your mood",
        placeHolder: "Just feeling great today..."
      });
      if (note === void 0)
        return;
      const tagsSelection = await vscode.window.showQuickPick(
        [
          { label: "work" },
          { label: "health" },
          { label: "social" },
          { label: "focus" },
          { label: "stress" }
        ],
        { placeHolder: "Select tags (optional)", canPickMany: true }
      );
      if (tagsSelection === void 0)
        return;
      const tags = tagsSelection.map((t) => t.label);
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Logging mood\u2026" },
        async () => {
          try {
            await logMood(client, { score, note: note || void 0, tags: tags.length > 0 ? tags : void 0 });
            vscode.window.showInformationMessage(`Mood logged successfully! (Score: ${score})`);
            const color = score >= 7 ? "\u{1F7E2}" : score >= 4 ? "\u{1F7E1}" : "\u{1F534}";
            moodStatusBarItem.text = `${color} Mood: ${score}/10`;
          } catch (e) {
            vscode.window.showErrorMessage(`Failed to log mood: ${e}`);
          }
        }
      );
    }),
    vscode.commands.registerCommand("echomirror.viewStreak", async () => {
      const client = await getClient();
      if (!client)
        return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Fetching streak\u2026" },
        async () => {
          try {
            const streak = await getMoodStreak(client);
            vscode.window.showInformationMessage(`\u{1F525} Current Streak: ${streak.current} days | Longest: ${streak.longest} days`);
          } catch (e) {
            vscode.window.showErrorMessage(`Failed to fetch streak: ${e}`);
          }
        }
      );
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("echomirror")) {
        clearInterval(balanceInterval);
        const cfg = vscode.workspace.getConfiguration("echomirror");
        if (cfg.get("showStatusBar") && cfg.get("statusBarPublicKey")) {
          statusBarItem.show();
          startBalancePolling();
        } else {
          statusBarItem.hide();
        }
      }
    })
  );
}
function deactivate() {
  clearInterval(balanceInterval);
}
async function showBalance(publicKey) {
  const config = vscode.workspace.getConfiguration("echomirror");
  const network = config.get("network") ?? "testnet";
  const horizon = network === "testnet" ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Fetching balance\u2026" },
    async () => {
      try {
        const res = await fetch(`${horizon}/accounts/${publicKey}`);
        if (!res.ok) {
          vscode.window.showErrorMessage(`Account not found on ${network}`);
          return;
        }
        const data = await res.json();
        const xlm = data.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
        const echo = data.balances.find((b) => b.asset_code === "ECHO")?.balance ?? "0";
        vscode.window.showInformationMessage(`\u{1F4B0} ${xlm} XLM  \u2022  ${echo} ECHO  (${network})`);
        statusBarItem.text = `$(symbol-misc) ${parseFloat(echo).toFixed(2)} ECHO`;
        statusBarItem.tooltip = `${xlm} XLM \u2022 ${echo} ECHO on ${network}`;
      } catch (e) {
        vscode.window.showErrorMessage(`Error fetching balance: ${e}`);
      }
    }
  );
}
function updateStatusBar() {
  statusBarItem.text = "$(symbol-misc) ECHO";
  statusBarItem.tooltip = "EchoMirror SDK \u2014 click to check balance";
}
function startBalancePolling() {
  const config = vscode.workspace.getConfiguration("echomirror");
  const key = config.get("statusBarPublicKey");
  if (!key)
    return;
  showBalance(key);
  balanceInterval = setInterval(() => showBalance(key), 6e4);
}
function getSyncExplorerHtml() {
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
        statusEl.textContent = '\u274C Invalid Stellar address'
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
          div.textContent = '\u{1F4E6} Ledger ' + r.ledger + '  \u2022  ' + r.hash.slice(0, 16) + '\u2026  \u2022  ' + new Date(r.created_at).toLocaleTimeString()
          eventsEl.prepend(div)
        }
        statusEl.textContent = 'Watching \u2022 ' + totalSeen + ' records seen'
      } catch (e) {
        const div = document.createElement('div')
        div.className = 'event error'
        div.textContent = '\u26A0\uFE0F ' + e.toString()
        eventsEl.prepend(div)
      }
    }
  </script>
</body>
</html>`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
