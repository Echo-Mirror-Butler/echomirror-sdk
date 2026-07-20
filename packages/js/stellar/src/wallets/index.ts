import { WalletNotFoundError } from '../errors'
import type { StellarNetworkId } from '../networks'
import { AlbedoAdapter } from './albedo'
import { FreighterAdapter } from './freighter'
import type { WalletAdapter, WalletConnection, WalletId } from './types'
import { XBullAdapter } from './xbull'

export { AlbedoAdapter } from './albedo'
export { FreighterAdapter } from './freighter'
export { XBullAdapter } from './xbull'
export type { SignOptions, WalletAdapter, WalletConnection, WalletId } from './types'

export interface WalletOptions {
  /**
   * Network your app targets. Used by wallets that don't expose a network
   * selection of their own (Albedo, xBull). Default 'mainnet'.
   */
  network?: StellarNetworkId
}

/** All wallet adapters this SDK ships, in default preference order. */
export function getWalletAdapters(options: WalletOptions = {}): WalletAdapter[] {
  const network = options.network ?? 'mainnet'
  // Extensions first; Albedo last because it is always "available" in a
  // browser and acts as the universal fallback.
  return [new FreighterAdapter(), new XBullAdapter(network), new AlbedoAdapter(network)]
}

export function getWalletAdapter(id: WalletId, options: WalletOptions = {}): WalletAdapter {
  const adapter = getWalletAdapters(options).find((a) => a.id === id)
  if (!adapter) throw new WalletNotFoundError(`Unknown wallet id: ${id}`)
  return adapter
}

/**
 * Detect which wallets are usable right now.
 * Returns an empty array outside the browser or when nothing is installed.
 */
export async function detectWallets(options: WalletOptions = {}): Promise<WalletAdapter[]> {
  const adapters = getWalletAdapters(options)
  const availability = await Promise.all(adapters.map((a) => a.isAvailable()))
  return adapters.filter((_, i) => availability[i])
}

export interface ConnectWalletOptions extends WalletOptions {
  /**
   * Wallets to try, in order. Defaults to ['freighter', 'xbull', 'albedo'] —
   * installed extensions first, with Albedo's popup as the universal fallback.
   */
  preferred?: WalletId[]
}

/**
 * Connect to the first available wallet.
 *
 * Tries each wallet in preference order and prompts the user to approve the
 * first one that is available. Throws {@link WalletNotFoundError} with install
 * links for all supported wallets when none can be used.
 *
 * @example
 * const { adapter, connection } = await connectWallet({ network: 'testnet' })
 * console.log(`Connected to ${adapter.name} as ${connection.publicKey}`)
 */
export async function connectWallet(
  options: ConnectWalletOptions = {},
): Promise<{ adapter: WalletAdapter; connection: WalletConnection }> {
  const order = options.preferred ?? ['freighter', 'xbull', 'albedo']
  const adapters = order.map((id) => getWalletAdapter(id, options))

  for (const adapter of adapters) {
    if (await adapter.isAvailable()) {
      const connection = await adapter.connect()
      return { adapter, connection }
    }
  }

  const installList = adapters.map((a) => `${a.name} (${a.installUrl})`).join(', ')
  throw new WalletNotFoundError(
    `No Stellar wallet is available in this environment. Install one of: ${installList}. ` +
      'In Node.js there is no wallet to prompt — sign with a Keypair secret and submit the XDR directly.',
  )
}
