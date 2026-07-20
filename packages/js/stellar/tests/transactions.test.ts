import { Account, FeeBumpTransaction, Keypair, Operation, type Horizon } from '@stellar/stellar-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StellarClient } from '../src/client'
import {
  AccountNotFoundError,
  InsufficientBalanceError,
  TransactionMalformedError,
  TrustlineMissingError,
} from '../src/errors'

const ALICE = Keypair.random().publicKey()
const BOB = Keypair.random().publicKey()
const ISSUER = Keypair.random().publicKey()

interface FakeBalance {
  asset_type: string
  balance: string
  asset_code?: string
  asset_issuer?: string
  selling_liabilities?: string
}

function fakeAccount(
  publicKey: string,
  options: { xlm?: string; subentries?: number; balances?: FakeBalance[]; selling?: string } = {},
): Horizon.AccountResponse {
  const account = new Account(publicKey, '103720918407102567')
  return Object.assign(account, {
    subentry_count: options.subentries ?? 0,
    num_sponsoring: 0,
    num_sponsored: 0,
    balances: [
      {
        asset_type: 'native',
        balance: options.xlm ?? '100.0000000',
        selling_liabilities: options.selling ?? '0.0000000',
      },
      ...(options.balances ?? []),
    ],
  }) as unknown as Horizon.AccountResponse
}

function mockAccounts(client: StellarClient, accounts: Record<string, Horizon.AccountResponse | undefined>) {
  vi.spyOn(client.server, 'loadAccount').mockImplementation(async (id: string) => {
    const found = accounts[id]
    if (!found) throw { response: { status: 404, data: { status: 404 } } }
    return found
  })
}

afterEach(() => vi.restoreAllMocks())

describe('buildPaymentTransaction', () => {
  it('builds a native XLM payment with memo and time bounds', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE), [BOB]: fakeAccount(BOB) })

    const tx = await client.buildPaymentTransaction({
      source: ALICE,
      destination: BOB,
      amount: '12.5',
      memo: 'gift ✨',
    })

    expect(tx.operations).toHaveLength(1)
    const op = tx.operations[0] as Operation.Payment
    expect(op.type).toBe('payment')
    expect(op.destination).toBe(BOB)
    expect(op.amount).toBe('12.5000000')
    expect(op.asset.isNative()).toBe(true)
    expect(tx.memo.value?.toString()).toBe('gift ✨')
    expect(Number(tx.timeBounds?.maxTime)).toBeGreaterThan(Date.now() / 1000)
    expect(tx.networkPassphrase ?? '').not.toContain('Public Global')
  })

  it('rejects when the destination does not exist', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE) })

    await expect(
      client.buildPaymentTransaction({ source: ALICE, destination: BOB, amount: '5' }),
    ).rejects.toBeInstanceOf(AccountNotFoundError)
  })

  it('creates the destination account when createDestination is set', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE) })

    const tx = await client.buildPaymentTransaction({
      source: ALICE,
      destination: BOB,
      amount: '2',
      createDestination: true,
    })
    const op = tx.operations[0] as Operation.CreateAccount
    expect(op.type).toBe('createAccount')
    expect(op.startingBalance).toBe('2.0000000')
  })

  it('rejects createDestination below the 1 XLM base reserve', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE) })

    await expect(
      client.buildPaymentTransaction({ source: ALICE, destination: BOB, amount: '0.5', createDestination: true }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError)
  })

  it('rejects XLM payments beyond the spendable balance (reserve-aware)', async () => {
    const client = new StellarClient({ network: 'testnet' })
    // 10 XLM, 2 subentries → reserve is (2+2)*0.5 = 2 → spendable 8
    mockAccounts(client, {
      [ALICE]: fakeAccount(ALICE, { xlm: '10.0000000', subentries: 2 }),
      [BOB]: fakeAccount(BOB),
    })

    await expect(
      client.buildPaymentTransaction({ source: ALICE, destination: BOB, amount: '9' }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError)
    // 8 exactly is fine
    await expect(
      client.buildPaymentTransaction({ source: ALICE, destination: BOB, amount: '8' }),
    ).resolves.toBeDefined()
  })

  it('rejects issued-asset payments when the destination lacks a trustline', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE), [BOB]: fakeAccount(BOB) })

    await expect(
      client.buildPaymentTransaction({
        source: ALICE,
        destination: BOB,
        amount: '5',
        asset: { code: 'ECHO', issuer: ISSUER },
      }),
    ).rejects.toBeInstanceOf(TrustlineMissingError)
  })

  it('allows issued-asset payments when the trustline exists', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, {
      [ALICE]: fakeAccount(ALICE),
      [BOB]: fakeAccount(BOB, {
        balances: [{ asset_type: 'credit_alphanum4', asset_code: 'ECHO', asset_issuer: ISSUER, balance: '0.0000000' }],
      }),
    })

    const tx = await client.buildPaymentTransaction({
      source: ALICE,
      destination: BOB,
      amount: '5',
      asset: { code: 'ECHO', issuer: ISSUER },
    })
    const op = tx.operations[0] as Operation.Payment
    expect(op.asset.getCode()).toBe('ECHO')
  })

  it('skips checks when preflight is disabled', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE) }) // BOB missing, but preflight off

    const tx = await client.buildPaymentTransaction({
      source: ALICE,
      destination: BOB,
      amount: '5',
      preflight: false,
    })
    expect((tx.operations[0] as Operation.Payment).type).toBe('payment')
  })

  it('rejects memos over 28 bytes', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE), [BOB]: fakeAccount(BOB) })

    await expect(
      client.buildPaymentTransaction({
        source: ALICE,
        destination: BOB,
        amount: '1',
        memo: 'this memo is way, way too long for a Stellar text memo',
      }),
    ).rejects.toBeInstanceOf(TransactionMalformedError)
  })
})

describe('buildTrustlineTransaction', () => {
  it('builds a changeTrust operation with an optional limit', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE) })

    const tx = await client.buildTrustlineTransaction({
      source: ALICE,
      asset: { code: 'ECHO', issuer: ISSUER },
      limit: '1000',
    })
    const op = tx.operations[0] as Operation.ChangeTrust
    expect(op.type).toBe('changeTrust')
    expect(op.line).toMatchObject({ code: 'ECHO', issuer: ISSUER })
    expect(op.limit).toBe('1000.0000000')
  })
})

describe('path payments', () => {
  it('builds strict-send with an explicit path and destMin', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE) })

    const tx = await client.buildPathPaymentStrictSend({
      source: ALICE,
      destination: BOB,
      sendAsset: 'native',
      sendAmount: '10',
      destAsset: { code: 'ECHO', issuer: ISSUER },
      destMin: '95',
      path: [],
    })
    const op = tx.operations[0] as Operation.PathPaymentStrictSend
    expect(op.type).toBe('pathPaymentStrictSend')
    expect(op.sendAmount).toBe('10.0000000')
    expect(op.destMin).toBe('95.0000000')
  })

  it('quotes Horizon and applies slippage when destMin is omitted', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE) })
    vi.spyOn(client.server, 'strictSendPaths').mockReturnValue({
      call: async () => ({
        records: [
          { source_amount: '10.0000000', destination_amount: '100.0000000', path: [] },
          { source_amount: '10.0000000', destination_amount: '90.0000000', path: [] },
        ],
      }),
    } as never)

    const tx = await client.buildPathPaymentStrictSend({
      source: ALICE,
      destination: BOB,
      sendAsset: 'native',
      sendAmount: '10',
      destAsset: { code: 'ECHO', issuer: ISSUER },
      // destMin omitted → best quote (100) minus default 50 bps → 99.5
    })
    const op = tx.operations[0] as Operation.PathPaymentStrictSend
    expect(op.destMin).toBe('99.5000000')
  })

  it('builds strict-receive with sendMax derived plus slippage', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE) })
    vi.spyOn(client.server, 'strictReceivePaths').mockReturnValue({
      call: async () => ({
        records: [{ source_amount: '10.0000000', destination_amount: '100.0000000', path: [] }],
      }),
    } as never)

    const tx = await client.buildPathPaymentStrictReceive({
      source: ALICE,
      destination: BOB,
      sendAsset: 'native',
      destAsset: { code: 'ECHO', issuer: ISSUER },
      destAmount: '100',
    })
    const op = tx.operations[0] as Operation.PathPaymentStrictReceive
    expect(op.type).toBe('pathPaymentStrictReceive')
    expect(op.sendMax).toBe('10.0500000') // 10 + 50 bps
    expect(op.destAmount).toBe('100.0000000')
  })

  it('throws PathNotFoundError when Horizon returns no path', async () => {
    const client = new StellarClient({ network: 'testnet' })
    vi.spyOn(client.server, 'strictSendPaths').mockReturnValue({
      call: async () => ({ records: [] }),
    } as never)

    await expect(
      client.findPaymentPath({
        type: 'strict-send',
        sendAsset: 'native',
        sendAmount: '10',
        destAsset: { code: 'ECHO', issuer: ISSUER },
      }),
    ).rejects.toMatchObject({ code: 'PATH_NOT_FOUND' })
  })
})

describe('buildFeeBumpTransaction', () => {
  it('wraps a signed inner transaction with a sponsored fee', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE), [BOB]: fakeAccount(BOB) })

    const inner = await client.buildPaymentTransaction({ source: ALICE, destination: BOB, amount: '1' })
    const feeBump = client.buildFeeBumpTransaction({ feeSource: BOB, innerTransaction: inner.toXDR() })

    expect(feeBump).toBeInstanceOf(FeeBumpTransaction)
    expect(feeBump.feeSource).toBe(BOB)
    expect(BigInt(feeBump.fee)).toBeGreaterThan(BigInt(inner.fee))
  })

  it('refuses to fee-bump a fee-bump', async () => {
    const client = new StellarClient({ network: 'testnet' })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE), [BOB]: fakeAccount(BOB) })

    const inner = await client.buildPaymentTransaction({ source: ALICE, destination: BOB, amount: '1' })
    const feeBump = client.buildFeeBumpTransaction({ feeSource: BOB, innerTransaction: inner })
    expect(() =>
      client.buildFeeBumpTransaction({ feeSource: ALICE, innerTransaction: feeBump.toXDR() }),
    ).toThrow(TransactionMalformedError)
  })
})

describe('submitTransaction retry behaviour', () => {
  it('retries transient Horizon failures and succeeds', async () => {
    const client = new StellarClient({ network: 'testnet', retry: { baseDelayMs: 1, maxDelayMs: 2 } })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE), [BOB]: fakeAccount(BOB) })
    const tx = await client.buildPaymentTransaction({ source: ALICE, destination: BOB, amount: '1' })

    let attempts = 0
    vi.spyOn(client.server, 'submitTransaction').mockImplementation(async () => {
      attempts++
      if (attempts < 3) throw { response: { status: 504, data: { status: 504 } } }
      return { hash: 'abc', successful: true } as never
    })

    const result = await client.submitTransaction(tx)
    expect(result.hash).toBe('abc')
    expect(attempts).toBe(3)
  })

  it('does not retry permanent failures (tx_bad_seq)', async () => {
    const client = new StellarClient({ network: 'testnet', retry: { baseDelayMs: 1 } })
    mockAccounts(client, { [ALICE]: fakeAccount(ALICE), [BOB]: fakeAccount(BOB) })
    const tx = await client.buildPaymentTransaction({ source: ALICE, destination: BOB, amount: '1' })

    let attempts = 0
    vi.spyOn(client.server, 'submitTransaction').mockImplementation(async () => {
      attempts++
      throw {
        response: {
          status: 400,
          data: { status: 400, extras: { result_codes: { transaction: 'tx_bad_seq' } } },
        },
      }
    })

    await expect(client.submitTransaction(tx)).rejects.toMatchObject({ code: 'TX_BAD_SEQUENCE' })
    expect(attempts).toBe(1)
  })
})

describe('spendableXlm', () => {
  it('subtracts base reserve, subentries, and selling liabilities', () => {
    const client = new StellarClient({ network: 'testnet' })
    // 100 XLM, 3 subentries, 10 selling → 100 - (2+3)*0.5 - 10 = 87.5
    const account = fakeAccount(ALICE, { xlm: '100.0000000', subentries: 3, selling: '10.0000000' })
    expect(client.spendableXlm(account)).toBe('87.5')
  })

  it('never goes negative', () => {
    const client = new StellarClient({ network: 'testnet' })
    expect(client.spendableXlm(fakeAccount(ALICE, { xlm: '1.0000000' }))).toBe('0')
  })
})
