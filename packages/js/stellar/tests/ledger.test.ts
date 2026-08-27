import { Account, Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'

// The Ledger app signs the raw signature-base with a real Ed25519 key —
// use a real Keypair as the "device" so the resulting transaction XDR can
// be verified the same way a real signed transaction would be, rather than
// asserting against opaque mock return values.
const deviceKeypair = Keypair.random()

function buildUnsignedXdr(): string {
  const account = new Account(deviceKeypair.publicKey(), '1')
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: 'GDNSSYSCSSJ76FER5WEEXME5G4MTCUBKDRQSKOYP36KUKVDB2VCMERS6',
        asset: Asset.native(),
        amount: '10',
      }),
    )
    .setTimeout(30)
    .build()
  return tx.toXDR()
}

vi.mock('@ledgerhq/hw-transport-webhid', () => ({
  default: {
    isSupported: async () => true,
    create: async () => ({ close: async () => {} }),
  },
}))

vi.mock('@ledgerhq/hw-app-str', () => {
  class FakeStr {
    async getPublicKey() {
      return { rawPublicKey: deviceKeypair.rawPublicKey() }
    }
    async signTransaction(_path: string, signatureBase: Buffer) {
      return { signature: deviceKeypair.sign(signatureBase) }
    }
  }
  return { default: FakeStr }
})

// jsdom doesn't implement WebHID; the adapter only checks `typeof window`.
beforeEach(() => {
  vi.stubGlobal('window', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LedgerWalletAdapter', () => {
  it('connects and returns the device public key as a StrKey address', async () => {
    const { LedgerWalletAdapter } = await import('../src/wallets/ledger')
    const connection = await new LedgerWalletAdapter('testnet').connect()
    expect(connection).toEqual({
      walletId: 'ledger',
      publicKey: deviceKeypair.publicKey(),
      network: 'testnet',
    })
  })

  it('signs a transaction with a valid, verifiable signature', async () => {
    const { LedgerWalletAdapter } = await import('../src/wallets/ledger')
    const unsignedXdr = buildUnsignedXdr()

    const signedXdr = await new LedgerWalletAdapter('testnet').signTransaction(unsignedXdr, {
      networkPassphrase: TESTNET_PASSPHRASE,
    })

    const signed = TransactionBuilder.fromXDR(signedXdr, TESTNET_PASSPHRASE)
    expect(signed.signatures).toHaveLength(1)

    const sig = signed.signatures[0]
    expect(sig.hint()).toEqual(deviceKeypair.signatureHint())
    expect(deviceKeypair.verify(signed.signatureBase(), sig.signature())).toBe(true)
  })

  it('throws WalletNotFoundError when the transport is unavailable', async () => {
    vi.stubGlobal('window', undefined)
    const { LedgerWalletAdapter } = await import('../src/wallets/ledger')
    const { WalletNotFoundError } = await import('../src/errors')

    await expect(new LedgerWalletAdapter().connect()).rejects.toBeInstanceOf(WalletNotFoundError)
  })
})
