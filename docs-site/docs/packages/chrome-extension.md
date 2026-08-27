---
sidebar_position: 2
title: Chrome Extension
---

# EchoMirror Chrome Extension

The EchoMirror Chrome extension is a browser companion that lets you check Stellar balances, inject mood-logging widgets into any page, and monitor Stellar transactions from the browser toolbar.

## Install

### Development (Unpacked)

1. Build the extension source (TypeScript must be compiled to JavaScript):

   ```bash
   cd extensions/chrome
   # Compile TypeScript (once a build pipeline is configured)
   ```

2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `extensions/chrome/` directory

### Chrome Web Store

_once published, search "EchoMirror SDK Companion" in the Chrome Web Store._

## Features

### Popup — Balance Check

Enter a Stellar public key (G-address) and select a network (`testnet` or `mainnet`), then click **Check Balance**. The popup displays your XLM and ECHO token balances, cached for 60 seconds.

### Popup — Inject Mood Widget

Click **Inject Mood Widget** to add a floating mood-logging button to the current tab. The widget:

- Appears as a fixed-position circle in the bottom-right corner
- Opens a mood-logging form with a score slider (1–10) mapped to emojis
- Logs the mood entry locally (no server connection yet)

### Popup — Watch Transactions

Click **Watch** to start monitoring Stellar transactions in the background. The extension polls Horizon every 5 seconds and shows Chrome desktop notifications for each new transaction.

### Background Service Worker

The background service worker runs independently of the popup:

- Listens for `START_WATCH` / `STOP_WATCH` messages from the popup
- Polls Stellar Horizon for new transactions on the watched account
- Fires Chrome notifications for each new transaction (ledger number, truncated hash, memo)

### Content Script

The extension declares a content script (`content.js`) injected on all pages at `document_idle`. _This file is not yet implemented._

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Persist public key, network, and cached balance |
| `activeTab` | Access the current tab for widget injection |
| `scripting` | Inject the mood widget via `chrome.scripting.executeScript` |
| `notifications` | Show desktop notifications for new transactions |

### Host Permissions

| Host | Purpose |
|---|---|
| `https://horizon.stellar.org/*` | Mainnet Horizon API |
| `https://horizon-testnet.stellar.org/*` | Testnet Horizon API |
| `https://api.echomirror.dev/*` | EchoMirror API (reserved for future use) |

## Known Limitations

- **No build pipeline**: The extension has TypeScript source but no compilation step, `tsconfig.json`, or bundler configuration. The `popup.html`, `background.js`, and `content.js` files referenced in `manifest.json` do not yet exist on disk. To load the extension, these must be compiled from the TypeScript sources.
- **Missing icons**: The `icons/` directory with `icon16.png`, `icon48.png`, and `icon128.png` is not present.
- **Mood widget is local-only**: The injected mood widget logs moods to the UI but does not persist them or send them to an EchoMirror backend.
- **No Stripe/SDK integration**: The popup and background worker use raw `fetch()` against Horizon rather than `@echomirror/core` or `@echomirror/stellar`.
