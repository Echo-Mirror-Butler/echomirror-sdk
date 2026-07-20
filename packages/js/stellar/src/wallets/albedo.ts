import { WalletNotFoundError, mapWalletError } from '../errors'
import type { StellarNetworkId } from '../networks'
import type { SignOptions, WalletAdapter, WalletConnection } from './types'
import { networkFromPassphrase } from '../networks'

/**
 * Albedo (https://albedo.link) is a web-based signer, not an extension: it
 * opens a popup where the user approves each intent, so it is available in any
 * browser without installing anything. That makes it the universal fallback
 * when no extension wallet is detected.
 *
 * Albedo has no persistent "current network" — the network is chosen per
 * signing intent — so the adapter is constructed with the network your app
 * targets (defaults to mainnet).
 */
export class AlbedoAdapter implements WalletAdapter {
  readonly id = 'albedo' as const
  readonly name = 'Albedo'
  readonly installUrl = 'https://albedo.link'

  constructor(private readonly network: StellarNetworkId = 'mainnet') {}

  async isAvailable(): Promise<boolean> {
    // Popup-based: usable in any browser context, never in Node.
    return typeof window !== 'undefined' && typeof document !== 'undefined'
  }

  private async intent() {
    const mod = await import('@albedo-link/intent')
    return (mod.default ?? mod) as {
      publicKey(opts: { token?: string }): Promise<{ pubkey: string }>
      tx(opts: {
        xdr: string
        pubkey?: string
        network?: string
        submit?: boolean
      }): Promise<{ signed_envelope_xdr: string }>
    }
  }

  async connect(): Promise<WalletConnection> {
    if (!(await this.isAvailable())) {
      throw new WalletNotFoundError('Albedo requires a browser environment (it signs via a popup at albedo.link).', this.id)
    }
    try {
      const albedo = await this.intent()
      const { pubkey } = await albedo.publicKey({})
      return { walletId: this.id, publicKey: pubkey, network: this.network }
    } catch (err) {
      throw mapWalletError(this.id, err, 'connect')
    }
  }

  async signTransaction(xdr: string, options: SignOptions): Promise<string> {
    if (!(await this.isAvailable())) {
      throw new WalletNotFoundError('Albedo requires a browser environment (it signs via a popup at albedo.link).', this.id)
    }
    try {
      const albedo = await this.intent()
      const network = networkFromPassphrase(options.networkPassphrase)
      const result = await albedo.tx({
        xdr,
        pubkey: options.address,
        // Albedo omits the param for pubnet and takes 'testnet' for testnet
        network: network === 'testnet' ? 'testnet' : undefined,
        submit: false,
      })
      return result.signed_envelope_xdr
    } catch (err) {
      throw mapWalletError(this.id, err, 'sign')
    }
  }
}
