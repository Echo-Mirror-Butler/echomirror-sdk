import { TransactionMalformedError } from './errors'

const STROOPS_PER_UNIT = 10_000_000n

/** Parse a decimal amount ("12.5", 12.5) into stroops without float drift. */
export function toStroops(amount: string | number): bigint {
  const text = typeof amount === 'number' ? amount.toString() : amount.trim()
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(text)
  if (!match) {
    throw new TransactionMalformedError(
      `Invalid amount "${text}". Amounts must be positive decimals with at most 7 decimal places (Stellar's precision).`,
    )
  }
  const whole = BigInt(match[1])
  const frac = BigInt((match[2] ?? '').padEnd(7, '0') || '0')
  const stroops = whole * STROOPS_PER_UNIT + frac
  if (stroops <= 0n) {
    throw new TransactionMalformedError(`Amount must be greater than zero, got "${text}".`)
  }
  return stroops
}

/** Format stroops back into Stellar's canonical 7-decimal string. */
export function fromStroops(stroops: bigint): string {
  const negative = stroops < 0n
  const abs = negative ? -stroops : stroops
  const whole = abs / STROOPS_PER_UNIT
  const frac = (abs % STROOPS_PER_UNIT).toString().padStart(7, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`
}

/** Normalise a user-supplied amount into a canonical string for the SDK. */
export function normalizeAmount(amount: string | number): string {
  return fromStroops(toStroops(amount))
}

/** amount reduced by `bps` basis points (used for slippage-derived minimums). */
export function reduceByBps(amount: string, bps: number): string {
  const stroops = toStroops(amount)
  return fromStroops((stroops * BigInt(10_000 - Math.round(bps))) / 10_000n)
}

/** amount increased by `bps` basis points (used for slippage-derived maximums). */
export function increaseByBps(amount: string, bps: number): string {
  const stroops = toStroops(amount)
  return fromStroops((stroops * BigInt(10_000 + Math.round(bps))) / 10_000n)
}
