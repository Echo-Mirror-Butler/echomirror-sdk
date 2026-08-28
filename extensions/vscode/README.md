# EchoMirror SDK for VS Code

EchoMirror SDK developer tools — Stellar address validation, mood log snippets, blockchain sync explorer, and live ECHO balance in the status bar.

## Features

- **Check Stellar Balance** — view live XLM / ECHO balance for any account
- **Validate Stellar Address** — quick G-address validation
- **Fund Testnet Account** — top up a testnet account via Friendbot
- **Log Mood** — log mood entries to EchoMirror and track streaks
- **Sync Explorer** — watch real-time Stellar transactions in a webview
- **Code Snippets** — TypeScript / JavaScript and Dart boilerplate for the EchoMirror SDK

## Usage

Run any command from the Command Palette (`Cmd/Ctrl+Shift+P`) prefixed with `EchoMirror:`.

Configure keys under **Settings → Extensions → EchoMirror SDK**:

| Setting | Description |
| --- | --- |
| `echomirror.apiKey` | Your EchoMirror API key (echomirror.dev/developers) |
| `echomirror.network` | Stellar network: `mainnet` or `testnet` |
| `echomirror.statusBarPublicKey` | Public key for the live status-bar ECHO balance |
| `echomirror.showStatusBar` | Toggle the live status-bar balance |

To persist your key securely, use the **EchoMirror: Sign In** command (stores it in VS Code's secret storage).

## Release Notes

See the [CHANGELOG](../../../CHANGELOG.md).

## License

MIT