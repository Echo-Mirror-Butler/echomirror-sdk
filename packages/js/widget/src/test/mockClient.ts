import type { EchoMirrorClient } from '@echomirror/core'

/** Minimal EchoMirrorClient stub. The widget only forwards it to `logMood`,
 *  which is mocked per-test, so the real `request`/`emit` are never called. */
export function createMockClient(): EchoMirrorClient {
  return {
    request: (() => Promise.resolve({})) as EchoMirrorClient['request'],
    emit: (() => {}) as EchoMirrorClient['emit'],
    on: (() => () => {}) as EchoMirrorClient['on'],
    off: (() => {}) as EchoMirrorClient['off'],
    setAuthToken: (() => {}) as EchoMirrorClient['setAuthToken'],
    config: {
      apiKey: 'test',
      baseUrl: 'https://api.test',
      network: 'testnet',
      timeout: 1000,
    },
  } as unknown as EchoMirrorClient
}
