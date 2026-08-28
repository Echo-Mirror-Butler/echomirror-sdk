import { vi } from 'vitest'

type StoredValues = Record<string, unknown>
type MessageListener = (message: Record<string, unknown>) => unknown

let storedValues: StoredValues = {}

export const chromeMock = {
  runtime: {
    onMessage: {
      addListener: vi.fn<[listener: MessageListener], void>(),
    },
    sendMessage: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  notifications: {
    create: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
}

export function resetChromeMock(values: StoredValues = {}) {
  storedValues = { ...values }
  vi.clearAllMocks()

  chromeMock.runtime.sendMessage.mockResolvedValue(undefined)
  chromeMock.storage.local.get.mockImplementation(
    (_keys: unknown, callback: (items: StoredValues) => void) => callback({ ...storedValues }),
  )
  chromeMock.storage.local.set.mockImplementation(
    (items: StoredValues, callback?: () => void) => {
      storedValues = { ...storedValues, ...items }
      callback?.()
    },
  )
  chromeMock.tabs.query.mockResolvedValue([{ id: 1, title: 'Test tab', url: 'about:blank' }])
  chromeMock.scripting.executeScript.mockResolvedValue([{ result: undefined }])
}

export function storedValue(key: string): unknown {
  return storedValues[key]
}
