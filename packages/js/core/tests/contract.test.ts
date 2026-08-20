/**
 * EchoMirror contract-test runner (TypeScript).
 *
 * Reads the shared `contract-tests/contract-spec.json` and drives the real
 * `@echomirror/core` HTTP binding (`EchoMirrorClient.request`) against the
 * docker-compose fixture (`fixture-api` on 127.0.0.1:18080). The mood and
 * stellar high-level wrappers that are already spec-compliant (`@echomirror/mood`,
 * `@echomirror/stellar`) are exercised too.
 *
 * Known wrapper drift (documented in contract-tests/README.md and intentionally
 * NOT asserted as passing):
 *   - `@echomirror/stellar` getTransactionHistory sends `publicKey` as the query
 *     param (canonical wire param is `public_key`).
 *   - `@echomirror/social` LeaderboardClient requests `?window=weekly` and expects
 *     a bare array; canonical is `?limit=` + `{ "entries": [...] }`.
 * The runner exercises those two endpoints at the transport level so the command
 * surface stays covered without masking the drift.
 *
 * The suite self-skips when the fixture is not reachable.
 *
 * Env overrides:
 *   ECHOMIRROR_CONTRACT_SPEC       path to contract-spec.json
 *   ECHOMIRROR_CONTRACT_API_BASE   e.g. http://127.0.0.1:18080
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EchoMirrorClient, EchoMirrorError } from '../src'
import type { EchoMirrorClient as CoreClient } from '@echomirror/core'
import { getMoodStreak, getMoodSummary, logMood } from '../../mood/src/index'
import { getBalance, submitTransaction } from '../../stellar/src/echomirror'

type Spec = {
  operations: Array<{
    id: string
    method: string
    path: string
    request?: { body?: unknown }
    response: { status: number; body: Record<string, unknown> }
    assertions: Array<{ field: string; eq: unknown; path?: string }>
  }>
}

const defaultSpecPath = fileURLToPath(
  new URL('../../../../contract-tests/contract-spec.json', import.meta.url),
)
const spec = JSON.parse(readFileSync(process.env.ECHOMIRROR_CONTRACT_SPEC ?? defaultSpecPath, 'utf8')) as Spec

const apiBase = process.env.ECHOMIRROR_CONTRACT_API_BASE ?? 'http://127.0.0.1:18080'
const publicKey = 'GDKUJHNOCQ6NOFJCSPE5IZMFFRZ6U4VO3EEFJQKJSDK5B4VZTH4XKSKD'
const client = new EchoMirrorClient({
  apiKey: 'contract-test-key',
  baseUrl: apiBase,
  network: 'testnet',
  timeout: 5000,
}) as unknown as CoreClient

function op(id: string) {
  const found = spec.operations.find((o) => o.id === id)
  if (!found) throw new Error(`operation ${id} not found in contract spec`)
  return found
}

/** Walk a dotted path (`entries.0.score`) into a parsed JSON value. */
function at(node: unknown, path: string | undefined): unknown {
  if (!path) return node
  let current: unknown = node
  for (const seg of path.split('.')) {
    if (!seg) continue
    if (Array.isArray(current)) current = current[Number(seg)]
    else current = (current as Record<string, unknown>)[seg]
  }
  return current
}

function assertWire(wire: unknown, assertions: Spec['operations'][number]['assertions'], opId: string) {
  for (const a of assertions) {
    const actual = (at(wire, a.path) as Record<string, unknown>)?.[a.field]
    expect(actual, `${opId}: ${a.path ? a.path + '.' : ''}${a.field}`).toEqual(a.eq)
  }
}

const enabled = await (async () => {
  try {
    const res = await fetch(`${apiBase}/mood/streak`, { signal: AbortSignal.timeout(2000) })
    return res.ok || res.status !== 0
  } catch (err) {
    if (process.env.ECHOMIRROR_CONTRACT_SPEC) {
      throw new Error(
        `contract fixture not reachable at ${apiBase} — contract tests are required because ` +
          `ECHOMIRROR_CONTRACT_SPEC is set: ${(err as Error).message}`,
      )
    }
    return false
  }
})()

describe.skipIf(!enabled)('EchoMirror contract (JS binding)', () => {
  it('fetch_mood_streak matches the contract', async () => {
    const streak = await getMoodStreak(client)
    assertWire(streak, op('fetch_mood_streak').assertions, 'fetch_mood_streak')
  })

  it('fetch_mood_summary matches the contract', async () => {
    const summary = await getMoodSummary(client, 'week')
    assertWire(summary, op('fetch_mood_summary').assertions, 'fetch_mood_summary')
  })

  it('log_mood matches the contract', async () => {
    const entry = await logMood(client, { score: 8, note: 'Great day', tags: ['work', 'proud'] })
    assertWire(entry, op('log_mood').assertions, 'log_mood')
  })

  it('get_social_feed matches the contract', async () => {
    const feed = await client.request('GET', '/social/feed?limit=10')
    assertWire(feed, op('get_social_feed').assertions, 'get_social_feed')
  })

  it('get_leaderboard matches the contract at the transport level', async () => {
    const body = await client.request('GET', '/social/leaderboard?limit=10')
    assertWire(body, op('get_leaderboard').assertions, 'get_leaderboard')
  })

  it('build_echo_transfer matches the contract', async () => {
    const o = op('build_echo_transfer')
    const result = await client.request('POST', o.path, o.request?.body)
    assertWire(result, o.assertions, 'build_echo_transfer')
  })

  it('submit_payment_transaction matches the contract', async () => {
    const o = op('submit_payment_transaction')
    const xdr = (o.request?.body as { xdr: string }).xdr
    const tx = await submitTransaction(client, xdr)
    assertWire(tx, o.assertions, 'submit_payment_transaction')
  })

  it('get_transaction_history matches the contract at the transport level', async () => {
    const body = await client.request(
      'GET',
      `/stellar/transactions?public_key=${publicKey}&limit=10`,
    )
    assertWire(body, op('get_transaction_history').assertions, 'get_transaction_history')
  })

  it('get_stellar_balance_api matches the contract', async () => {
    const balance = await getBalance(client, publicKey)
    assertWire(balance, op('get_stellar_balance_api').assertions, 'get_stellar_balance_api')
  })

  it('api_request_to_unknown_route_must_fail surfaces a 404 error', async () => {
    const o = op('api_request_to_unknown_route_must_fail')
    let caught: unknown
    try {
      await client.request('GET', o.path)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(EchoMirrorError)
    expect((caught as EchoMirrorError).statusCode).toBe(404)
  })
})