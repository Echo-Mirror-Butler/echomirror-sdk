/**
 * Integration suite against the live Stellar testnet.
 *
 * Run with: npm run test:integration  (sets STELLAR_INTEGRATION=1)
 *
 * Creates throwaway accounts via Friendbot, executes every transaction type
 * the SDK builds (payment, createAccount, trustline, issued-asset payment,
 * path payment, fee-bump), and asserts the resulting on-chain state through
 * Horizon. Also provokes real Horizon failures to pin the error taxonomy.
 */
import { Account, Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { beforeAll, describe, expect, it } from 'vitest'
import { StellarClient } from '../../src/client'
import { BadSequenceError, StellarSdkError, TrustlineMissingError } from '../../src/errors'
import { toStroops } from '../../src/amounts'

const enabled = process.env.STELLAR_INTEGRATION === '1'

const alice = Keypair.random() // sender / fee sponsor
const issuer = Keypair.random() // GIFT issuer & payment recipient
const charlie = Keypair.random() // funded, but no trustlines
const GIFT = { code: 'GIFT', issuer: issuer.publicKey() }

const client = new StellarClient({ network: 'testnet' })

async function xlmBalance(accountId: string): Promise<bigint> {
  const account = await client.loadAccount(accountId)
  const native = account.balances.find((b) => b.asset_type === 'native')!
  return toStroops(native.balance)
}

describe.skipIf(!enabled)('Stellar testnet integration', () => {
  beforeAll(async () => {
    await Promise.all([
      client.fundWithFriendbot(alice.publicKey()),
      client.fundWithFriendbot(issuer.publicKey()),
      client.fundWithFriendbot(charlie.publicKey()),
    ])
  }, 120_000)

  it('sends a native XLM payment and the balance moves on-chain', async () => {
    const before = await xlmBalance(issuer.publicKey())

    const tx = await client.buildPaymentTransaction({
      source: alice.publicKey(),
      destination: issuer.publicKey(),
      amount: '25.5',
      memo: 'echomirror it',
    })
    tx.sign(alice)
    const result = await client.submitTransaction(tx)
    expect(result.successful ?? true).toBeTruthy()

    const after = await xlmBalance(issuer.publicKey())
    expect(after - before).toBe(toStroops('25.5'))
  })

  it('creates a brand-new account via createDestination', async () => {
    const newborn = Keypair.random()
    const tx = await client.buildPaymentTransaction({
      source: alice.publicKey(),
      destination: newborn.publicKey(),
      amount: '3',
      createDestination: true,
    })
    tx.sign(alice)
    await client.submitTransaction(tx)

    expect(await client.accountExists(newborn.publicKey())).toBe(true)
    expect(await xlmBalance(newborn.publicKey())).toBe(toStroops('3'))
  })

  it('creates a trustline and receives an issued asset', async () => {
    const trustTx = await client.buildTrustlineTransaction({
      source: alice.publicKey(),
      asset: GIFT,
      limit: '1000000',
    })
    trustTx.sign(alice)
    await client.submitTransaction(trustTx)

    const withTrustline = await client.loadAccount(alice.publicKey())
    expect(
      withTrustline.balances.some((b) => 'asset_code' in b && b.asset_code === 'GIFT' && b.asset_issuer === GIFT.issuer),
    ).toBe(true)

    // Issuer pays 40 GIFT to alice (issuers mint by paying their own asset)
    const payTx = await client.buildPaymentTransaction({
      source: issuer.publicKey(),
      destination: alice.publicKey(),
      amount: '40',
      asset: GIFT,
    })
    payTx.sign(issuer)
    await client.submitTransaction(payTx)

    const funded = await client.loadAccount(alice.publicKey())
    const gift = funded.balances.find((b) => 'asset_code' in b && b.asset_code === 'GIFT')
    expect(gift?.balance).toBe('40.0000000')
  })

  it('executes a path payment (strict send)', async () => {
    const before = await xlmBalance(charlie.publicKey())

    // XLM→XLM with an empty path is a real pathPaymentStrictSend op on-chain
    // and needs no orderbook liquidity, so it is deterministic on testnet.
    const tx = await client.buildPathPaymentStrictSend({
      source: alice.publicKey(),
      destination: charlie.publicKey(),
      sendAsset: 'native',
      sendAmount: '7',
      destAsset: 'native',
      destMin: '7',
      path: [],
    })
    tx.sign(alice)
    await client.submitTransaction(tx)

    const after = await xlmBalance(charlie.publicKey())
    expect(after - before).toBe(toStroops('7'))
  })

  it('sponsors fees with a fee-bump transaction', async () => {
    // charlie pays 1 XLM to issuer, but alice covers the fee.
    const inner = await client.buildPaymentTransaction({
      source: charlie.publicKey(),
      destination: issuer.publicKey(),
      amount: '1',
    })
    inner.sign(charlie)

    const feeBump = client.buildFeeBumpTransaction({
      feeSource: alice.publicKey(),
      innerTransaction: inner.toXDR(),
    })
    feeBump.sign(alice)
    const result = await client.submitTransaction(feeBump)

    // Horizon ingestion of the record can lag the submission response slightly.
    let record: { fee_account: string; successful: boolean } | undefined
    for (let i = 0; i < 10 && !record; i++) {
      record = await client.server.transactions().transaction(result.hash).call()
        .catch(() => undefined)
      if (!record) await new Promise((r) => setTimeout(r, 2000))
    }
    expect(record?.fee_account).toBe(alice.publicKey())
    expect(record?.successful).toBe(true)
  })

  it('maps a real op_no_trust failure to TrustlineMissingError (no retry)', async () => {
    // charlie never made a GIFT trustline; skip preflight so Horizon itself rejects it.
    const tx = await client.buildPaymentTransaction({
      source: alice.publicKey(),
      destination: charlie.publicKey(),
      amount: '1',
      asset: GIFT,
      preflight: false,
    })
    tx.sign(alice)

    const err = await client.submitTransaction(tx).catch((e) => e)
    expect(err).toBeInstanceOf(TrustlineMissingError)
    expect(err.retryable).toBe(false)
    expect(err.resultCodes?.operations).toContain('op_no_trust')
  })

  it('maps a real op_no_destination failure to DESTINATION_NOT_FOUND', async () => {
    const ghost = Keypair.random().publicKey()
    const tx = await client.buildPaymentTransaction({
      source: alice.publicKey(),
      destination: ghost,
      amount: '1',
      preflight: false,
    })
    tx.sign(alice)

    const err = await client.submitTransaction(tx).catch((e) => e)
    expect(err).toBeInstanceOf(StellarSdkError)
    expect(err.code).toBe('DESTINATION_NOT_FOUND')
    expect(err.retryable).toBe(false)
  })

  it('maps a stale sequence number to BadSequenceError and does not retry it', async () => {
    // Note: resubmitting the *identical* envelope is NOT an error — Horizon
    // dedupes by hash and returns the original result (that is what makes
    // retry-on-timeout safe). A real tx_bad_seq needs a *different*
    // transaction built on an already-consumed sequence number.
    const staleSequence = (await client.loadAccount(alice.publicKey())).sequenceNumber()

    const first = await client.buildPaymentTransaction({
      source: alice.publicKey(),
      destination: issuer.publicKey(),
      amount: '1',
    })
    first.sign(alice)
    await client.submitTransaction(first)

    const stale = new TransactionBuilder(new Account(alice.publicKey(), staleSequence), {
      fee: '100',
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(Operation.payment({ destination: issuer.publicKey(), asset: Asset.native(), amount: '2' }))
      .setTimeout(120)
      .build()
    stale.sign(alice)

    const err = await client.submitTransaction(stale).catch((e) => e)
    expect(err).toBeInstanceOf(BadSequenceError)
    expect(err.retryable).toBe(false)
  })

  it('maps a missing account load to a non-retryable AccountNotFoundError', async () => {
    const err = await client.loadAccount(Keypair.random().publicKey()).catch((e) => e)
    expect(err.name).toBe('AccountNotFoundError')
    expect(err.retryable).toBe(false)
  })
})
