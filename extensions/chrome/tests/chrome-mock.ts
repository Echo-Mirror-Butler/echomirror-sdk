import { vi } from 'vitest'

export const chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn().mockResolvedValue(undefined),
    removeListener: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  notifications: {
    create: vi.fn(),
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1, title: 'Test', url: 'about:blank' }]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue(undefined),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}