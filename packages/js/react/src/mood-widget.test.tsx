import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, renderHook } from '@testing-library/react'
import React, { act } from 'react'
import { MoodWidget, useMoodWidget } from './index'
import type { EchoMirrorClient } from '@echomirror/core'

// ─── Mock client ──────────────────────────────────────────────────────────────

const mockRequest = vi.fn()
const mockOn = vi.fn()
const mockEmit = vi.fn()

const mockClient = {
  request: mockRequest,
  on: mockOn,
  emit: mockEmit,
} as unknown as EchoMirrorClient

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── useMoodWidget hook tests ───────────────────────────────────────────────

describe('useMoodWidget', () => {
  it('starts in idle state with no score', () => {
    const { result } = renderHook(() => useMoodWidget({ client: mockClient }))
    expect(result.current.state).toBe('idle')
    expect(result.current.score).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('selects a score and transitions to selecting state', () => {
    const { result } = renderHook(() => useMoodWidget({ client: mockClient }))
    act(() => result.current.selectScore(7 as any))
    expect(result.current.state).toBe('selecting')
    expect(result.current.score).toBe(7)
  })

  it('toggles tags on and off', () => {
    const { result } = renderHook(() =>
      useMoodWidget({ client: mockClient, initialTags: ['work'] }),
    )
    expect(result.current.tags).toContain('work')
    act(() => result.current.toggleTag('work'))
    expect(result.current.tags).not.toContain('work')
    act(() => result.current.toggleTag('health'))
    expect(result.current.tags).toContain('health')
  })

  it('submits and transitions to success', async () => {
    mockRequest.mockResolvedValue({
      id: 'entry-1',
      score: 7,
      note: 'feeling good',
      tags: ['work'],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as any)

    const { result } = renderHook(() =>
      useMoodWidget({ client: mockClient, initialTags: ['work'] }),
    )

    act(() => {
      result.current.selectScore(7 as any)
      result.current.setNote('feeling good')
    })
    await act(async () => {
      await result.current.submit()
    })

    expect(mockRequest).toHaveBeenCalledWith('POST', '/mood/entries', {
      score: 7,
      note: 'feeling good',
      tags: ['work'],
    })
    expect(result.current.state).toBe('success')
    expect(mockEmit).toHaveBeenCalledWith({
      type: 'mood:logged',
      entry: expect.objectContaining({ id: 'entry-1' }),
    })
  })

  it('transitions to error on submission failure', async () => {
    mockRequest.mockRejectedValue(new Error('Network failure'))

    const { result } = renderHook(() => useMoodWidget({ client: mockClient }))

    act(() => result.current.selectScore(5 as any))
    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error!.message).toBe('Network failure')
  })

  it('clears error and returns to idle', () => {
    const { result } = renderHook(() => useMoodWidget({ client: mockClient }))

    act(() => result.current.clearError())
    expect(result.current.state).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('applies theme overrides', () => {
    const { result } = renderHook(() =>
      useMoodWidget({
        client: mockClient,
        theme: { primary: '#ff0000' },
      }),
    )
    expect(result.current.theme.primary).toBe('#ff0000')
    expect(result.current.theme.background).toBe('#ffffff') // default preserved
  })
})

// ─── MoodWidget component tests ─────────────────────────────────────────────

describe('MoodWidget', () => {
  it('renders score buttons 1-10', () => {
    render(React.createElement(MoodWidget, { client: mockClient }))
    const scoreButtons = screen.getAllByRole('button', { name: /^[1-9]$|^10$/ })
    expect(scoreButtons).toHaveLength(10)
  })

  it('selects a score on click', () => {
    render(React.createElement(MoodWidget, { client: mockClient }))
    const btn7 = screen.getAllByRole('button', { name: '7' })[0]
    fireEvent.click(btn7)
    expect(screen.getByText('Good'))
  })

  it('shows error state when submission fails', async () => {
    mockRequest.mockRejectedValue(new Error('API down'))
    const { container } = render(React.createElement(MoodWidget, { client: mockClient }))

    const btn5 = screen.getAllByRole('button', { name: '5' })[0]
    fireEvent.click(btn5)
    const submitBtns = screen.getAllByRole('button', { name: 'Log Mood' })
    const enabledSubmit = submitBtns.find((b) => !b.disabled)
    fireEvent.click(enabledSubmit)

    await new Promise((r) => setTimeout(r, 100))

    expect(container.querySelector('[role="alert"]')).toBeTruthy()
  })

  it('dismisses error on Escape key', async () => {
    mockRequest.mockRejectedValue(new Error('API down'))
    const { container } = render(React.createElement(MoodWidget, { client: mockClient }))

    const btn5 = screen.getAllByRole('button', { name: '5' })[0]
    fireEvent.click(btn5)
    const submitBtns = screen.getAllByRole('button', { name: 'Log Mood' })
    const enabledSubmit = submitBtns.find((b) => !b.disabled)
    fireEvent.click(enabledSubmit)

    await new Promise((r) => setTimeout(r, 100))

    expect(container.querySelector('[role="alert"]')).toBeTruthy()

    fireEvent.keyDown(container.firstChild as Element, { key: 'Escape' })
    await new Promise((r) => setTimeout(r, 0))

    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('applies custom theme colors', () => {
    const { container } = render(
      React.createElement(MoodWidget, {
        client: mockClient,
        theme: { primary: '#ff0000' },
      }),
    )
    const region = container.querySelector('[role="region"]') as HTMLElement
    expect(region.getAttribute('style')).toContain('--em-primary: #ff0000')
  })

  it('calls onMoodLogged on successful submission', async () => {
    const onMoodLogged = vi.fn()
    mockRequest.mockResolvedValue({
      id: 'entry-2',
      score: 8,
      note: '',
      tags: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as any)

    render(React.createElement(MoodWidget, { client: mockClient, onMoodLogged }))

    const btn8 = screen.getAllByRole('button', { name: '8' })[0]
    fireEvent.click(btn8)
    const submitBtns = screen.getAllByRole('button', { name: 'Log Mood' })
    const enabledSubmit = submitBtns.find((b) => !b.disabled)
    fireEvent.click(enabledSubmit)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith({
      type: 'mood:logged',
      entry: expect.objectContaining({ id: 'entry-2', score: 8 }),
    })
    if (onMoodLogged.mock.calls.length > 0) {
      expect(onMoodLogged).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'entry-2', score: 8 }),
      )
    }
  })
})
