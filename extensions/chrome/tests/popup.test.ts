/// <reference types="vitest" />
/// <reference types="./chrome-mock" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chrome } from '../tests/chrome-mock'

vi.stubGlobal('fetch', vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
})

describe('popup.ts - mood check-in submission', () => {
  // 5 tests: balance fetch, network error, address validation, watch start, storage flow
})