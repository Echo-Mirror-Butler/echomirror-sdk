import { WalletNotFoundError, mapWalletError } from '../errors'
import { networkFromPassphrase } from '../networks'
import type { SignOptions, WalletAdapter, WalletConnection } from './types'

/**
 * Ledger hardware wallet adapter for Stellar.
 *
 * Uses `@ledgerhq/hw-transport-webhid` for USB communication and
 * `@ledgerhq/hw-app-str` for the Stellar Ledger app protocol.
 *
 * @note Requires the Stellar app to be open on the Ledger device.
 * Hardware wallets cannot be present in CI — tests mock the transport layer.
 */

export class LedgerWalletAdapter implements WalletAdapter {
  readonly id = 'ledger' as const
  readonly name = 'Ledger'
  readonly installUrl = 'https://www.ledger.com'

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false
    try {
      const TransportWebHID = (await import('@ledgerhq/hw-transport-webhid')).default
      return typeof TransportWebHID?.isSupported === 'function'
        ? await TransportWebHID.isSupported()
        : false
    } catch {
      return false
    }
  }

  async connect(): Promise<WalletConnection> {
    try {
      const { transport, stellar } = await this.open()
      try {
        const response = await stellar.getAddress("44'/148'/0'")
        if (!response.publicKey) {
          throw new Error('Ledger returned no public key — is the Stellar app open on the device?')
        }
        return { walletId: this.id, publicKey: response.publicKey, network: 'mainnet' }
      } finally {
        await transport.close()
      }
    } catch (err) {
      if (err instanceof WalletNotFoundError) throw err
      throw mapWalletError(this.id, err, 'connect')
    }
  }

  async signTransaction(xdr: string, options: SignOptions): Promise<string> {
    try {
      const { transport, stellar } = await this.open()
      try {
        const network = networkFromPassphrase(options.networkPassphrase)
        const response = await stellar.signTransaction("44'/148'/0'", network, xdr)
        if (!response?.signature) {
          throw new Error('Ledger returned no signature — the user may have rejected the transaction.')
        }
        return response.signature
      } finally {
        await transport.close()
      }
    } catch (err) {
      if (err instanceof WalletNotFoundError) throw err
      throw mapWalletError(this.id, err, 'sign')
    }
  }

  private async open(): Promise<{
    transport: { close(): Promise<void> }
    stellar: {
      getAddress(path: string): Promise<{ publicKey: string }>
      signTransaction(path: string, network: string, xdr: string): Promise<{ signature: string }>
    }
  }> {
    if (typeof window === 'undefined') {
      throw new WalletNotFoundError('Ledger requires a browser with WebHID support.', this.id)
    }

    let TransportWebHID: typeof import('@ledgerhq/hw-transport-webhid').default
    try {
      TransportWebHID = (await import('@ledgerhq/hw-transport-webhid')).default
    } catch {
      throw new WalletNotFoundError(
        'Ledger transport not found. Install @ledgerhq/hw-transport-webhid.',
        this.id,
      )
    }

    const transport = await TransportWebHID.create()

    let Str: typeof import('@ledgerhq/hw-app-str').default
    try {
      Str = (await import('@ledgerhq/hw-app-str')).default
    } catch {
      await transport.close()
      throw new WalletNotFoundError(
        'Ledger Stellar app not found. Install @ledgerhq/hw-app-str.',
        this.id,
      )
    }

    const stellar = new Str(transport)
    return { transport, stellar }
  }
}
