import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { EchoMirrorClient, MoodEntry } from '@echomirror/core'

const logMood = vi.fn()
vi.mock('@echomirror/mood', () => ({
  logMood: (client: EchoMirrorClient, payload: unknown) => logMood(client, payload),
}))

import { useMoodWidget } from './useMoodWidget'
import { createMockClient } from './test/mockClient'

describe('useMoodWidget', () => {
  beforeEach(() => logMood.mockReset())

  it('exposes state and stable action handlers', () => {
    const { result } = renderHook(() =>
      useMoodWidget({ client: createMockClient() }),
    )
    expect(result.current.status).toBe('idle')
    expect(result.current.canSubmit).toBe(false)
    expect(typeof result.current.setScore).toBe('function')
    expect(typeof result.current.submit).toBe('function')
  })

  it('reflects score selection via React state', () => {
    const { result } = renderHook(() =>
      useMoodWidget({ client: createMockClient() }),
    )
    act(() => result.current.setScore(7))
    expect(result.current.score).toBe(7)
    expect(result.current.canSubmit).toBe(true)
  })

  it('runs the submit flow and lands on success', async () => {
    logMood.mockResolvedValue({
      id: 'h-1',
      userId: 'u',
      score: 7,
      tags: [],
      createdAt: '',
      updatedAt: '',
    } as MoodEntry)
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useMoodWidget({ client: createMockClient(), onSubmit }),
    )
    act(() => result.current.setScore(7))
    await act(async () => {
      await result.current.submit()
    })
    expect(result.current.status).toBe('success')
    expect(result.current.confirmed).toBe(true)
    expect(onSubmit).toHaveBeenCalled()
  })

  it('forwards the latest callbacks without recreating the controller', () => {
    const client = createMockClient()
    const first = vi.fn()
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useMoodWidget({ client, onSubmit: cb }),
      { initialProps: { cb: first } },
    )
    const controllerA = result.current.controller
    const second = vi.fn()
    rerender({ cb: second })
    expect(result.current.controller).toBe(controllerA)
  })
})
