import type { EchoMirrorClient } from '@echomirror/core'
import type { StellarBalance, StellarTransaction, EchoTransfer } from '@echomirror/core'
import { NETWORKS } from './networks'
import { FreighterAdapter } from './wallets/freighter'
import { detectWallets } from './wallets'
import { WalletNotFoundError } from './errors'

/**
 * Helpers backed by the EchoMirror API (mood/social/ECHO token endpoints).
 * These pre-date the multi-wallet layer and keep their original signatures;
 * signing now goes through the wallet adapters, so any supported wallet works.
 */

// ─── Freighter wallet (kept for backwards compatibility) ─────────────────────

export interface FreighterConnection {
  publicKey: string
  network: 'mainnet' | 'testnet'
}

/**
 * Prompt the user to connect their Freighter wallet.
 * Only works in browser environments with the Freighter extension installed.
 *
 * Prefer {@link connectWallet}, which falls back to xBull and Albedo when
 * Freighter is not installed.
 *
 * @example
 * const wallet = await connectFreighter()
 * console.log(wallet.publicKey) // G...
 */
export async function connectFreighter(): Promise<FreighterConnection> {
  const connection = await new FreighterAdapter().connect()
  return { publicKey: connection.publicKey, network: connection.network }
}

/**
 * Sign an XDR transaction with Freighter.
 * Prefer `adapter.signTransaction()` from {@link connectWallet}.
 */
export async function signWithFreighter(xdr: string, network: 'mainnet' | 'testnet'): Promise<string> {
  return new FreighterAdapter().signTransaction(xdr, { networkPassphrase: NETWORKS[network].passphrase })
}

// ─── Balance ──────────────────────────────────────────────────────────────────

/**
 * Get the XLM and ECHO token balance for a Stellar public key.
 *
 * @example
 * const balance = await getBalance(client, wallet.publicKey)
 * console.log(`${balance.xlm} XLM  •  ${balance.echo} ECHO`)
 */
export async function getBalance(
  client: EchoMirrorClient,
  publicKey: string,
): Promise<StellarBalance> {
  return client.request('GET', `/stellar/balance/${publicKey}`)
}

// ─── Transfers ────────────────────────────────────────────────────────────────

/**
 * Send ECHO tokens to any Stellar address.
 * The SDK builds the transaction server-side — signing uses whichever
 * supported wallet is available (Freighter, xBull, or Albedo).
 *
 * @example
 * await sendEcho(client, {
 *   from: wallet.publicKey,
 *   to: 'GFRIENDPUBLICKEY',
 *   amount: 5,
 *   memo: 'Great energy today ✨',
 * })
 */
export async function sendEcho(
  client: EchoMirrorClient,
  transfer: EchoTransfer,
): Promise<StellarTransaction> {
  // 1. Build the transaction envelope on the server
  const { xdr } = await client.request<{ xdr: string }>('POST', '/stellar/build-transfer', transfer)

  // 2. Sign with whichever wallet is available
  const wallets = await detectWallets({ network: client.config.network })
  if (wallets.length === 0) {
    throw new WalletNotFoundError(
      'No signing method available. In Node.js, pass a signed XDR directly via submitTransaction().',
    )
  }
  const signedXdr = await wallets[0].signTransaction(xdr, {
    networkPassphrase: NETWORKS[client.config.network].passphrase,
    address: transfer.from,
  })

  // 3. Submit and return the transaction record
  const tx = await client.request<StellarTransaction>('POST', '/stellar/submit', { xdr: signedXdr })
  client.emit({ type: 'stellar:transfer_sent', tx })
  return tx
}

/**
 * Submit a pre-signed XDR transaction (server-side or custom signing).
 */
export async function submitTransaction(
  client: EchoMirrorClient,
  signedXdr: string,
): Promise<StellarTransaction> {
  return client.request('POST', '/stellar/submit', { xdr: signedXdr })
}

// ─── Transaction history ──────────────────────────────────────────────────────

/**
 * Get paginated Stellar transaction history for a public key.
 */
export async function getTransactionHistory(
  client: EchoMirrorClient,
  publicKey: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<{ transactions: StellarTransaction[]; cursor: string | null }> {
  const params = new URLSearchParams({ publicKey })
  if (options.limit) params.set('limit', String(options.limit))
  if (options.cursor) params.set('cursor', options.cursor)
  return client.request('GET', `/stellar/transactions?${params}`)
}

// ─── Testnet ──────────────────────────────────────────────────────────────────

/**
 * Fund a testnet account using Stellar Friendbot (via the EchoMirror API).
 * Only works when the client is configured with network: 'testnet'.
 *
 * @example
 * // Get 10,000 XLM on testnet instantly for development
 * await fundTestnetAccount(client, wallet.publicKey)
 */
export async function fundTestnetAccount(
  client: EchoMirrorClient,
  publicKey: string,
): Promise<void> {
  if (client.config.network !== 'testnet') {
    throw new Error('fundTestnetAccount is only available on testnet')
  }
  await client.request('POST', '/stellar/friendbot', { publicKey })
}

export type { StellarBalance, StellarTransaction, EchoTransfer }
