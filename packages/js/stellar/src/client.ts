import {
  Asset,
  BASE_FEE,
  FeeBumpTransaction,
  Horizon,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk'
import { fromStroops, increaseByBps, normalizeAmount, reduceByBps, toStroops } from './amounts'
import {
  AccountNotFoundError,
  HorizonUnavailableError,
  InsufficientBalanceError,
  PathNotFoundError,
  StellarSdkError,
  TransactionMalformedError,
  TrustlineMissingError,
  mapHorizonError,
} from './errors'
import { NETWORKS, type StellarNetworkConfig, type StellarNetworkId } from './networks'
import { withRetry, type RetryOptions } from './retry'
import type { WalletAdapter } from './wallets/types'

// ─── Public option types ──────────────────────────────────────────────────────

/** An asset: 'native'/'XLM' for lumens, or a code+issuer pair. */
export type AssetSpec = 'native' | 'XLM' | { code: string; issuer: string }

export interface StellarClientConfig {
  /** Which network to talk to. Default 'testnet'. */
  network?: StellarNetworkId
  /** Override the Horizon URL (e.g. your own Horizon instance). */
  horizonUrl?: string
  /** Per-operation base fee in stroops. Default the network minimum (100). */
  baseFee?: string
  /** Transaction time bound in seconds. Default 300. */
  timeoutSeconds?: number
  /** Retry policy for transient Horizon failures. */
  retry?: RetryOptions
}

export interface PaymentOptions {
  source: string
  destination: string
  /** Decimal amount, e.g. '12.5'. Max 7 decimal places. */
  amount: string | number
  /** Default 'native' (XLM). */
  asset?: AssetSpec
  /** Text memo, max 28 bytes. */
  memo?: string
  /**
   * When sending native XLM to an account that does not exist yet, create it
   * (createAccount operation) instead of failing. Default false.
   */
  createDestination?: boolean
  /**
   * Check destination existence/trustline and source balance before building,
   * so users never sign a transaction that is doomed to fail. Costs one or two
   * extra Horizon calls. Default true.
   */
  preflight?: boolean
}

export interface TrustlineOptions {
  source: string
  asset: { code: string; issuer: string }
  /** Maximum amount the account is willing to hold. Default: unlimited. */
  limit?: string
}

export interface PathPaymentStrictSendOptions {
  source: string
  destination: string
  sendAsset: AssetSpec
  /** Exact amount of sendAsset debited from the source. */
  sendAmount: string | number
  destAsset: AssetSpec
  /**
   * Minimum the destination must receive. When omitted, the path is quoted
   * from Horizon and destMin derived from the quote minus `slippageBps`.
   */
  destMin?: string
  /** Conversion path. When omitted, the best path is quoted from Horizon. */
  path?: AssetSpec[]
  /** Slippage tolerance in basis points for derived destMin. Default 50 (0.5%). */
  slippageBps?: number
  memo?: string
}

export interface PathPaymentStrictReceiveOptions {
  source: string
  destination: string
  sendAsset: AssetSpec
  /**
   * Maximum of sendAsset the source is willing to spend. When omitted, the
   * path is quoted from Horizon and sendMax derived plus `slippageBps`.
   */
  sendMax?: string
  destAsset: AssetSpec
  /** Exact amount of destAsset the destination receives. */
  destAmount: string | number
  path?: AssetSpec[]
  slippageBps?: number
  memo?: string
}

export interface FeeBumpOptions {
  /** Account that pays the (higher) fee on behalf of the inner transaction. */
  feeSource: string
  /** The signed inner transaction, or its base64 envelope XDR. */
  innerTransaction: Transaction | string
  /** New per-operation fee in stroops. Default 10× the client's base fee. */
  baseFee?: string
}

export interface PaymentPathQuote {
  sourceAmount: string
  destinationAmount: string
  path: AssetSpec[]
}

// ─── Asset helpers ────────────────────────────────────────────────────────────

export function toAsset(spec: AssetSpec): Asset {
  if (spec === 'native' || spec === 'XLM') return Asset.native()
  return new Asset(spec.code, spec.issuer)
}

function assetLabel(spec: AssetSpec): string {
  return spec === 'native' || spec === 'XLM' ? 'XLM' : spec.code
}

function toMemo(memo: string): Memo {
  if (new TextEncoder().encode(memo).length > 28) {
    throw new TransactionMalformedError(`Memo "${memo}" exceeds Stellar's 28-byte text memo limit.`)
  }
  return Memo.text(memo)
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * Wallet-agnostic Stellar client: builds every transaction type the EchoMirror
 * SDK supports, submits with retry/backoff on transient Horizon failures, and
 * maps every failure to a typed {@link StellarSdkError}.
 *
 * @example
 * const stellar = new StellarClient({ network: 'testnet' })
 * const { adapter, connection } = await connectWallet({ network: 'testnet' })
 * const tx = await stellar.buildPaymentTransaction({
 *   source: connection.publicKey,
 *   destination: 'G…',
 *   amount: '5',
 * })
 * const result = await stellar.signAndSubmit(adapter, tx)
 */
export class StellarClient {
  readonly network: StellarNetworkConfig
  readonly server: Horizon.Server
  readonly baseFee: string
  readonly timeoutSeconds: number
  private readonly retryOptions: RetryOptions

  constructor(config: StellarClientConfig = {}) {
    this.network = NETWORKS[config.network ?? 'testnet']
    this.server = new Horizon.Server(config.horizonUrl ?? this.network.horizonUrl)
    this.baseFee = config.baseFee ?? BASE_FEE
    this.timeoutSeconds = config.timeoutSeconds ?? 300
    this.retryOptions = config.retry ?? {}
  }

  get networkPassphrase(): string {
    return this.network.passphrase
  }

  // ── Accounts ────────────────────────────────────────────────────────────────

  /** Load an account, retrying transient failures. Typed 404 → AccountNotFoundError. */
  async loadAccount(accountId: string, role: 'source' | 'destination' = 'source'): Promise<Horizon.AccountResponse> {
    return withRetry(async () => {
      try {
        return await this.server.loadAccount(accountId)
      } catch (err) {
        const mapped = mapHorizonError(err)
        throw mapped.code === 'ACCOUNT_NOT_FOUND' ? new AccountNotFoundError(accountId, role) : mapped
      }
    }, this.retryOptions)
  }

  async accountExists(accountId: string): Promise<boolean> {
    try {
      await this.loadAccount(accountId)
      return true
    } catch (err) {
      if (err instanceof StellarSdkError && (err.code === 'ACCOUNT_NOT_FOUND' || err.code === 'DESTINATION_NOT_FOUND')) {
        return false
      }
      throw err
    }
  }

  /**
   * XLM the account can actually spend: balance minus base reserve
   * (1 XLM + 0.5 per subentry/sponsorship) and selling liabilities.
   */
  spendableXlm(account: Horizon.AccountResponse): string {
    const native = account.balances.find((b) => b.asset_type === 'native')
    if (!native) return '0'
    const sponsorship = account as unknown as { num_sponsoring?: number; num_sponsored?: number }
    const reserveStroops =
      (2n + BigInt(account.subentry_count) + BigInt(sponsorship.num_sponsoring ?? 0) - BigInt(sponsorship.num_sponsored ?? 0)) *
      5_000_000n
    const selling = 'selling_liabilities' in native ? toSafeStroops(native.selling_liabilities) : 0n
    const spendable = toSafeStroops(native.balance) - reserveStroops - selling
    return spendable > 0n ? fromStroops(spendable) : '0'
  }

  // ── Transaction builders ────────────────────────────────────────────────────

  /**
   * Build a payment. Handles native XLM and issued assets; can create the
   * destination account on the fly for XLM (`createDestination: true`).
   */
  async buildPaymentTransaction(options: PaymentOptions): Promise<Transaction> {
    const asset = options.asset ?? 'native'
    const isNative = asset === 'native' || asset === 'XLM'
    const amount = normalizeAmount(options.amount)
    const sourceAccount = await this.loadAccount(options.source, 'source')

    let operation: xdr.Operation | undefined
    if ((options.preflight ?? true) || options.createDestination) {
      const destinationExists = await this.accountExists(options.destination)
      if (!destinationExists) {
        if (isNative && options.createDestination) {
          if (toStroops(amount) < toStroops('1')) {
            throw new InsufficientBalanceError(
              `Creating a new account requires at least 1 XLM (the base reserve); got ${amount}.`,
            )
          }
          operation = Operation.createAccount({ destination: options.destination, startingBalance: amount })
        } else {
          throw new AccountNotFoundError(options.destination, 'destination')
        }
      } else if (!isNative && options.preflight !== false) {
        const destination = await this.loadAccount(options.destination, 'destination')
        const spec = asset as { code: string; issuer: string }
        const hasTrustline = destination.balances.some(
          (b) => 'asset_code' in b && b.asset_code === spec.code && b.asset_issuer === spec.issuer,
        )
        if (!hasTrustline) {
          throw new TrustlineMissingError(
            `Destination ${options.destination} has no trustline for ${spec.code}:${spec.issuer}. ` +
              'The recipient must run buildTrustlineTransaction() for this asset before they can receive it.',
          )
        }
      }
      if (isNative && options.preflight !== false) {
        const spendable = this.spendableXlm(sourceAccount)
        if (toStroops(amount) > toSafeStroops(spendable)) {
          throw new InsufficientBalanceError(
            `Source can spend at most ${spendable} XLM (after the base reserve and open liabilities) but the payment needs ${amount} XLM.`,
          )
        }
      }
    }

    operation ??= Operation.payment({
      destination: options.destination,
      asset: toAsset(asset),
      amount,
    })

    return this.buildTransaction(sourceAccount, [operation], options.memo)
  }

  /** Build a changeTrust transaction so `source` can hold `asset`. */
  async buildTrustlineTransaction(options: TrustlineOptions): Promise<Transaction> {
    const sourceAccount = await this.loadAccount(options.source, 'source')
    const operation = Operation.changeTrust({
      asset: toAsset(options.asset),
      limit: options.limit !== undefined ? normalizeAmount(options.limit) : undefined,
    })
    return this.buildTransaction(sourceAccount, [operation])
  }

  /**
   * Quote conversion paths from Horizon. Returns the best quote or throws
   * {@link PathNotFoundError} when no path has enough liquidity.
   */
  async findPaymentPath(
    query:
      | { type: 'strict-send'; sendAsset: AssetSpec; sendAmount: string; destAsset: AssetSpec }
      | { type: 'strict-receive'; sendAsset: AssetSpec; destAsset: AssetSpec; destAmount: string },
  ): Promise<PaymentPathQuote> {
    const records = await withRetry(async () => {
      try {
        if (query.type === 'strict-send') {
          const page = await this.server
            .strictSendPaths(toAsset(query.sendAsset), normalizeAmount(query.sendAmount), [toAsset(query.destAsset)])
            .call()
          return page.records
        }
        const page = await this.server
          .strictReceivePaths([toAsset(query.sendAsset)], toAsset(query.destAsset), normalizeAmount(query.destAmount))
          .call()
        return page.records
      } catch (err) {
        throw mapHorizonError(err)
      }
    }, this.retryOptions)

    if (records.length === 0) {
      throw new PathNotFoundError(
        `No conversion path with enough liquidity from ${assetLabel(query.sendAsset)} to ${assetLabel(query.destAsset)}. ` +
          'Try a smaller amount or a different asset pair.',
      )
    }

    // Best quote: most destination for strict-send, least source for strict-receive.
    const best = records.reduce((a, b) => {
      if (query.type === 'strict-send') {
        return toSafeStroops(b.destination_amount) > toSafeStroops(a.destination_amount) ? b : a
      }
      return toSafeStroops(b.source_amount) < toSafeStroops(a.source_amount) ? b : a
    })

    return {
      sourceAmount: best.source_amount,
      destinationAmount: best.destination_amount,
      path: best.path.map((p) =>
        p.asset_type === 'native' ? ('native' as const) : { code: p.asset_code!, issuer: p.asset_issuer! },
      ),
    }
  }

  /**
   * Path payment, exact-send flavour: debit exactly `sendAmount` of
   * `sendAsset`; the destination receives at least `destMin` of `destAsset`.
   * Ideal for "gift 5 XLM worth of ECHO" flows.
   */
  async buildPathPaymentStrictSend(options: PathPaymentStrictSendOptions): Promise<Transaction> {
    const sendAmount = normalizeAmount(options.sendAmount)
    let { destMin, path } = options
    if (destMin === undefined || path === undefined) {
      const quote = await this.findPaymentPath({
        type: 'strict-send',
        sendAsset: options.sendAsset,
        sendAmount,
        destAsset: options.destAsset,
      })
      path ??= quote.path
      destMin ??= reduceByBps(quote.destinationAmount, options.slippageBps ?? 50)
    }

    const sourceAccount = await this.loadAccount(options.source, 'source')
    const operation = Operation.pathPaymentStrictSend({
      sendAsset: toAsset(options.sendAsset),
      sendAmount,
      destination: options.destination,
      destAsset: toAsset(options.destAsset),
      destMin: normalizeAmount(destMin),
      path: path.map(toAsset),
    })
    return this.buildTransaction(sourceAccount, [operation], options.memo)
  }

  /**
   * Path payment, exact-receive flavour: the destination receives exactly
   * `destAmount` of `destAsset`; the source spends at most `sendMax` of
   * `sendAsset`.
   */
  async buildPathPaymentStrictReceive(options: PathPaymentStrictReceiveOptions): Promise<Transaction> {
    const destAmount = normalizeAmount(options.destAmount)
    let { sendMax, path } = options
    if (sendMax === undefined || path === undefined) {
      const quote = await this.findPaymentPath({
        type: 'strict-receive',
        sendAsset: options.sendAsset,
        destAsset: options.destAsset,
        destAmount,
      })
      path ??= quote.path
      sendMax ??= increaseByBps(quote.sourceAmount, options.slippageBps ?? 50)
    }

    const sourceAccount = await this.loadAccount(options.source, 'source')
    const operation = Operation.pathPaymentStrictReceive({
      sendAsset: toAsset(options.sendAsset),
      sendMax: normalizeAmount(sendMax),
      destination: options.destination,
      destAsset: toAsset(options.destAsset),
      destAmount,
      path: path.map(toAsset),
    })
    return this.buildTransaction(sourceAccount, [operation], options.memo)
  }

  /**
   * Wrap a signed transaction in a fee-bump so `feeSource` pays (sponsors) the
   * fee. The fee-bump must then be signed by `feeSource` and submitted.
   */
  buildFeeBumpTransaction(options: FeeBumpOptions): FeeBumpTransaction {
    const inner =
      typeof options.innerTransaction === 'string'
        ? (TransactionBuilder.fromXDR(options.innerTransaction, this.networkPassphrase) as Transaction)
        : options.innerTransaction
    if (inner instanceof FeeBumpTransaction) {
      throw new TransactionMalformedError('Cannot fee-bump a transaction that is already a fee-bump envelope.')
    }
    const baseFee = options.baseFee ?? String(BigInt(this.baseFee) * 10n)
    return TransactionBuilder.buildFeeBumpTransaction(options.feeSource, baseFee, inner, this.networkPassphrase)
  }

  private buildTransaction(
    sourceAccount: Horizon.AccountResponse,
    operations: xdr.Operation[],
    memo?: string,
  ): Transaction {
    const builder = new TransactionBuilder(sourceAccount, {
      fee: this.baseFee,
      networkPassphrase: this.networkPassphrase,
    })
    for (const op of operations) builder.addOperation(op)
    if (memo !== undefined) builder.addMemo(toMemo(memo))
    builder.setTimeout(this.timeoutSeconds)
    return builder.build()
  }

  // ── Submission ──────────────────────────────────────────────────────────────

  /**
   * Submit a signed transaction. Transient Horizon failures (timeout, 429,
   * 5xx) are retried with backoff — resubmitting an identical signed envelope
   * is idempotent because the transaction hash is unchanged. Permanent
   * failures throw immediately as typed errors and are never retried.
   */
  async submitTransaction(
    transaction: Transaction | FeeBumpTransaction | string,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    const tx =
      typeof transaction === 'string' ? TransactionBuilder.fromXDR(transaction, this.networkPassphrase) : transaction
    return withRetry(async () => {
      try {
        return await this.server.submitTransaction(tx)
      } catch (err) {
        throw mapHorizonError(err)
      }
    }, this.retryOptions)
  }

  /**
   * Have a wallet sign the transaction, then submit it.
   * Wallet rejections throw {@link WalletUserRejectedError} and are never retried.
   */
  async signAndSubmit(
    wallet: WalletAdapter,
    transaction: Transaction | FeeBumpTransaction,
    options: { address?: string } = {},
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    const signedXdr = await wallet.signTransaction(transaction.toXDR(), {
      networkPassphrase: this.networkPassphrase,
      address: options.address,
    })
    return this.submitTransaction(signedXdr)
  }

  // ── Testnet ─────────────────────────────────────────────────────────────────

  /** Create and fund a testnet account with Friendbot. Testnet only. */
  async fundWithFriendbot(publicKey: string): Promise<void> {
    if (!this.network.friendbotUrl) {
      throw new StellarSdkError(`Friendbot is only available on testnet (current network: ${this.network.id}).`, {
        code: 'TX_MALFORMED',
      })
    }
    const url = `${this.network.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`
    await withRetry(async () => {
      let res: globalThis.Response
      try {
        res = await fetch(url)
      } catch (err) {
        throw new HorizonUnavailableError(`Could not reach Friendbot: ${(err as Error).message}`, err)
      }
      // 400 usually means the account already exists — treat as success.
      if (!res.ok && res.status !== 400) {
        throw res.status >= 500
          ? new HorizonUnavailableError(`Friendbot returned ${res.status}.`)
          : new StellarSdkError(`Friendbot returned ${res.status}.`, { code: 'TX_FAILED' })
      }
    }, this.retryOptions)
  }
}

/** Stroops parser for values coming back from Horizon (already validated). */
function toSafeStroops(amount: string): bigint {
  const [whole, frac = ''] = amount.split('.')
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, '0').slice(0, 7) || '0')
}
