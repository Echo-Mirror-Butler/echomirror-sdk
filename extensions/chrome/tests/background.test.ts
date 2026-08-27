/// <reference types="vitest" />
/// <reference types="./chrome-mock" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chrome } from '../tests/chrome-mock'

vi.stubGlobal('fetch', vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('background.ts - service worker', () => {
  // 3 tests: START_WATCH handler, poll with notifications, silent error handling
})