import type { EchoMirrorClient } from '@echomirror/core'
import type { StellarBalance, StellarTransaction, EchoTransfer } from '@echomirror/core'

// ─── Freighter wallet (browser only) ─────────────────────────────────────────

export interface FreighterConnection {
  publicKey: string
  network: 'mainnet' | 'testnet'
}

/**
 * Prompt the user to connect their Freighter wallet.
 * Only works in browser environments with the Freighter extension installed.
 *
 * @example
 * const wallet = await connectFreighter()
 * console.log(wallet.publicKey) // G...
 */
export async function connectFreighter(): Promise<FreighterConnection> {
  const freighter = (globalThis as Record<string, unknown>).freighterApi
  if (!freighter) {
    throw new Error(
      'Freighter extension not found. Install it from https://freighter.app',
    )
  }
  const isAllowed: boolean = await (freighter as Record<string, () => Promise<boolean>>).isAllowed()
  if (!isAllowed) {
    await (freighter as Record<string, () => Promise<void>>).setAllowed()
  }
  const publicKey: string = await (freighter as Record<string, () => Promise<string>>).getPublicKey()
  const networkDetails = await (freighter as Record<string, () => Promise<{ networkPassphrase: string }>>).getNetworkDetails()
  const network = networkDetails.networkPassphrase.includes('Test') ? 'testnet' : 'mainnet'
  return { publicKey, network }
}

/**
 * Sign an XDR transaction with Freighter.
 */
export async function signWithFreighter(xdr: string, network: 'mainnet' | 'testnet'): Promise<string> {
  const freighter = (globalThis as Record<string, unknown>).freighterApi
  if (!freighter) throw new Error('Freighter extension not found')
  const { signedTransaction } = await (freighter as Record<string, (xdr: string, opts: { networkPassphrase: string }) => Promise<{ signedTransaction: string }>>).signTransaction(xdr, {
    networkPassphrase: network === 'testnet'
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015',
  })
  return signedTransaction
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
 * The SDK builds the transaction — you sign with Freighter (browser) or a secret key (server).
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

  // 2. Sign with Freighter if in browser context
  let signedXdr: string
  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).freighterApi) {
    signedXdr = await signWithFreighter(xdr, client.config.network)
  } else {
    throw new Error(
      'No signing method available. In Node.js, pass a signed XDR directly via submitTransaction().',
    )
  }

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
 * Fund a testnet account using Stellar Friendbot.
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
