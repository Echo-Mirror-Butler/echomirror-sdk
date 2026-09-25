import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, renderHook, waitFor, act } from '@testing-library/react'
import { EchoMirrorClient } from '@echomirror/core'
import type { UserProfile, MoodStreak } from '@echomirror/core'
import {
  EchoMirrorProvider,
  useEchoMirrorClient,
  useProfile,
  useMoodStreak,
  useSDKEvent,
} from '../src'

describe('@echomirror/react', () => {
  describe('EchoMirrorProvider & useEchoMirrorClient', () => {
    it('supplies an initialized EchoMirrorClient to child hooks', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <EchoMirrorProvider apiKey="test-api-key" config={{ network: 'testnet' }}>
          {children}
        </EchoMirrorProvider>
      )

      const { result } = renderHook(() => useEchoMirrorClient(), { wrapper })
      expect(result.current).toBeInstanceOf(EchoMirrorClient)
      expect(result.current.config.apiKey).toBe('test-api-key')
      expect(result.current.config.network).toBe('testnet')
    })

    it('throws a descriptive error when useEchoMirrorClient is used outside a provider', () => {
      // Suppress console.error in React for expected boundary error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => renderHook(() => useEchoMirrorClient())).toThrow(
        'useEchoMirror must be used inside <EchoMirrorProvider>',
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('useProfile', () => {
    it('returns null profile and false isLoading when no authToken is provided', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <EchoMirrorProvider apiKey="test-key">
          {children}
        </EchoMirrorProvider>
      )

      const { result } = renderHook(() => useProfile(), { wrapper })
      expect(result.current.profile).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('manages loading and success states when authToken is provided', async () => {
      const mockProfile: UserProfile = {
        id: 'user-001',
        publicKey: 'GABC...',
        createdAt: '2026-01-01T00:00:00Z',
      }

      const requestSpy = vi
        .spyOn(EchoMirrorClient.prototype, 'request')
        .mockImplementation((_method, path) => {
          if (path === '/users/me') {
            return Promise.resolve(mockProfile)
          }
          return Promise.resolve()
        })

      const setAuthTokenSpy = vi.spyOn(EchoMirrorClient.prototype, 'setAuthToken')

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <EchoMirrorProvider apiKey="test-key" authToken="valid-token">
          {children}
        </EchoMirrorProvider>
      )

      const { result } = renderHook(() => useProfile(), { wrapper })

      expect(setAuthTokenSpy).toHaveBeenCalledWith('valid-token')
      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.profile).toEqual(mockProfile)
      expect(result.current.error).toBeNull()
      expect(requestSpy).toHaveBeenCalledWith('GET', '/users/me')

      requestSpy.mockRestore()
      setAuthTokenSpy.mockRestore()
    })

    it('captures error state when profile request fails', async () => {
      const requestError = new Error('Unauthorized profile')
      const requestSpy = vi
        .spyOn(EchoMirrorClient.prototype, 'request')
        .mockRejectedValue(requestError)

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <EchoMirrorProvider apiKey="test-key" authToken="bad-token">
          {children}
        </EchoMirrorProvider>
      )

      const { result } = renderHook(() => useProfile(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.profile).toBeNull()
      expect(result.current.error).toBe(requestError)

      requestSpy.mockRestore()
    })
  })

  describe('useMoodStreak', () => {
    it('manages loading, success, and refetch states', async () => {
      const mockStreak: MoodStreak = {
        current: 5,
        longest: 12,
        isActiveToday: true,
      }

      const requestSpy = vi
        .spyOn(EchoMirrorClient.prototype, 'request')
        .mockResolvedValue(mockStreak)

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <EchoMirrorProvider apiKey="test-key">
          {children}
        </EchoMirrorProvider>
      )

      const { result } = renderHook(() => useMoodStreak(), { wrapper })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.streak).toEqual(mockStreak)
      expect(result.current.error).toBeNull()
      expect(requestSpy).toHaveBeenCalledWith('GET', '/mood/streak')

      // Test refetch functionality
      const updatedStreak: MoodStreak = {
        current: 6,
        longest: 12,
        isActiveToday: true,
      }
      requestSpy.mockResolvedValueOnce(updatedStreak)

      await act(async () => {
        await result.current.refetch()
      })

      expect(result.current.streak).toEqual(updatedStreak)

      requestSpy.mockRestore()
    })

    it('captures error state when fetching streak fails', async () => {
      const requestError = new Error('Streak endpoint unavailable')
      const requestSpy = vi
        .spyOn(EchoMirrorClient.prototype, 'request')
        .mockRejectedValue(requestError)

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <EchoMirrorProvider apiKey="test-key">
          {children}
        </EchoMirrorProvider>
      )

      const { result } = renderHook(() => useMoodStreak(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.streak).toBeNull()
      expect(result.current.error).toBe(requestError)

      requestSpy.mockRestore()
    })
  })

  describe('useSDKEvent', () => {
    it('subscribes to SDK events on mount and receives emitted events', () => {
      let clientInstance!: EchoMirrorClient
      const handler = vi.fn()

      function TestConsumer() {
        const client = useEchoMirrorClient()
        clientInstance = client
        useSDKEvent('mood:logged' as any, handler)
        return null
      }

      render(
        <EchoMirrorProvider apiKey="test-key">
          <TestConsumer />
        </EchoMirrorProvider>,
      )

      const eventPayload = {
        type: 'mood:logged',
        entry: { id: 'entry-1', score: 8 },
      }

      act(() => {
        clientInstance.emit(eventPayload as any)
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(eventPayload)
    })

    it('cleans up subscription when unmounted', () => {
      let clientInstance!: EchoMirrorClient
      const handler = vi.fn()

      function TestConsumer() {
        const client = useEchoMirrorClient()
        clientInstance = client
        useSDKEvent('mood:logged' as any, handler)
        return null
      }

      const { unmount } = render(
        <EchoMirrorProvider apiKey="test-key">
          <TestConsumer />
        </EchoMirrorProvider>,
      )

      unmount()

      act(() => {
        clientInstance.emit({
          type: 'mood:logged',
          entry: { id: 'entry-2', score: 10 },
        } as any)
      })

      expect(handler).not.toHaveBeenCalled()
    })
  })
})
