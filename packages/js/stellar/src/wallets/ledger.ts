import { Keypair, StrKey, TransactionBuilder, xdr as StellarXdr } from '@stellar/stellar-sdk'
import { WalletNotFoundError, mapWalletError } from '../errors'
import type { StellarNetworkId } from '../networks'
import type { SignOptions, WalletAdapter, WalletConnection } from './types'

const LEDGER_STELLAR_PATH = "44'/148'/0'"

/**
 * Ledger hardware wallet adapter for Stellar.
 *
 * Uses `@ledgerhq/hw-transport-webhid` for USB communication and
 * `@ledgerhq/hw-app-str` for the Stellar Ledger app protocol.
 *
 * The Ledger app only signs a raw signature-base hash — unlike the
 * extension-based adapters, this one has to parse the incoming XDR, get its
 * signature base, send that to the device, then attach the resulting
 * signature back onto the transaction and re-serialize it, since the
 * `WalletAdapter` contract returns a signed XDR envelope, not a bare
 * signature.
 *
 * Like xBull/Albedo, the device itself doesn't report which network it's
 * on, so the adapter is constructed with the network your app targets.
 *
 * @note Requires the Stellar app to be open on the Ledger device.
 * Hardware wallets cannot be present in CI — tests mock the transport layer.
 */

export class LedgerWalletAdapter implements WalletAdapter {
  readonly id = 'ledger' as const
  readonly name = 'Ledger'
  readonly installUrl = 'https://www.ledger.com'

  constructor(private readonly network: StellarNetworkId = 'mainnet') {}

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
        const { rawPublicKey } = await stellar.getPublicKey(LEDGER_STELLAR_PATH)
        if (!rawPublicKey) {
          throw new Error('Ledger returned no public key — is the Stellar app open on the device?')
        }
        const publicKey = StrKey.encodeEd25519PublicKey(rawPublicKey)
        return { walletId: this.id, publicKey, network: this.network }
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
        const transaction = TransactionBuilder.fromXDR(xdr, options.networkPassphrase)
        const signatureBase = transaction.signatureBase()

        const { rawPublicKey } = await stellar.getPublicKey(LEDGER_STELLAR_PATH)
        if (!rawPublicKey) {
          throw new Error('Ledger returned no public key — is the Stellar app open on the device?')
        }

        const { signature } = await stellar.signTransaction(LEDGER_STELLAR_PATH, signatureBase)
        if (!signature) {
          throw new Error('Ledger returned no signature — the user may have rejected the transaction.')
        }

        const keypair = Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(rawPublicKey))
        const decoratedSignature = new StellarXdr.DecoratedSignature({
          hint: keypair.signatureHint(),
          signature,
        })
        transaction.signatures.push(decoratedSignature)

        return transaction.toXDR()
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
      getPublicKey(path: string, display?: boolean): Promise<{ rawPublicKey: Buffer }>
      signTransaction(path: string, transaction: Buffer): Promise<{ signature: Buffer }>
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
