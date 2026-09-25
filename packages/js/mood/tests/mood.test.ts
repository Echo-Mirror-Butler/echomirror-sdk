import { describe, expect, it, vi } from 'vitest'
import type { EchoMirrorClient, MoodEntry, MoodStreak, MoodSummary, AIReflection } from '@echomirror/core'
import {
  logMood,
  getMoodHistory,
  getMoodEntry,
  deleteMoodEntry,
  getMoodStreak,
  getMoodSummary,
  requestAIReflection,
  getAIReflection,
} from '../src'

function createMockClient() {
  return {
    request: vi.fn(),
    emit: vi.fn(),
  } as unknown as EchoMirrorClient & {
    request: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
  }
}

describe('@echomirror/mood', () => {
  describe('logMood', () => {
    it('sends POST request to /mood/entries, emits mood:logged event, and returns entry', async () => {
      const client = createMockClient()
      const mockEntry: MoodEntry = {
        id: 'entry-123',
        userId: 'user-1',
        score: 8,
        note: 'Feeling positive',
        tags: ['grateful', 'work'],
        createdAt: '2026-09-25T10:00:00Z',
      }
      client.request.mockResolvedValueOnce(mockEntry)

      const payload = {
        score: 8 as const,
        note: 'Feeling positive',
        tags: ['grateful', 'work'] as any,
      }

      const result = await logMood(client, payload)

      expect(client.request).toHaveBeenCalledWith('POST', '/mood/entries', payload)
      expect(client.emit).toHaveBeenCalledWith({
        type: 'mood:logged',
        entry: mockEntry,
      })
      expect(result).toEqual(mockEntry)
    })

    it('propagates client request errors', async () => {
      const client = createMockClient()
      const error = new Error('Network failure')
      client.request.mockRejectedValueOnce(error)

      await expect(logMood(client, { score: 5 })).rejects.toThrow('Network failure')
      expect(client.emit).not.toHaveBeenCalled()
    })
  })

  describe('getMoodHistory', () => {
    it('requests /mood/entries with default empty query params', async () => {
      const client = createMockClient()
      client.request.mockResolvedValueOnce({ entries: [], total: 0 })

      const result = await getMoodHistory(client)

      expect(client.request).toHaveBeenCalledWith('GET', '/mood/entries?')
      expect(result).toEqual({ entries: [], total: 0 })
    })

    it('applies pagination and filtering parameters to query string', async () => {
      const client = createMockClient()
      client.request.mockResolvedValueOnce({ entries: [], total: 0 })

      await getMoodHistory(client, {
        limit: 25,
        offset: 50,
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-25T23:59:59Z',
        minScore: 4,
        maxScore: 9,
        tags: ['work', 'focus'] as any,
      })

      const requestedPath = client.request.mock.calls[0][1] as string
      expect(client.request.mock.calls[0][0]).toBe('GET')

      const [path, queryString] = requestedPath.split('?')
      expect(path).toBe('/mood/entries')

      const params = new URLSearchParams(queryString)
      expect(params.get('limit')).toBe('25')
      expect(params.get('offset')).toBe('50')
      expect(params.get('from')).toBe('2026-09-01T00:00:00Z')
      expect(params.get('to')).toBe('2026-09-25T23:59:59Z')
      expect(params.get('min_score')).toBe('4')
      expect(params.get('max_score')).toBe('9')
      expect(params.get('tags')).toBe('work,focus')
    })

    it('propagates errors when fetching mood history', async () => {
      const client = createMockClient()
      client.request.mockRejectedValueOnce(new Error('Unauthorized'))

      await expect(getMoodHistory(client)).rejects.toThrow('Unauthorized')
    })
  })

  describe('getMoodEntry', () => {
    it('fetches single entry by ID', async () => {
      const client = createMockClient()
      const mockEntry: MoodEntry = {
        id: 'entry-999',
        userId: 'user-1',
        score: 7,
        createdAt: '2026-09-25T10:00:00Z',
      }
      client.request.mockResolvedValueOnce(mockEntry)

      const result = await getMoodEntry(client, 'entry-999')
      expect(client.request).toHaveBeenCalledWith('GET', '/mood/entries/entry-999')
      expect(result).toEqual(mockEntry)
    })

    it('propagates not found error', async () => {
      const client = createMockClient()
      client.request.mockRejectedValueOnce(new Error('Entry not found'))

      await expect(getMoodEntry(client, 'non-existent')).rejects.toThrow('Entry not found')
    })
  })

  describe('deleteMoodEntry', () => {
    it('issues DELETE request for entry by ID', async () => {
      const client = createMockClient()
      client.request.mockResolvedValueOnce(undefined)

      await deleteMoodEntry(client, 'entry-456')
      expect(client.request).toHaveBeenCalledWith('DELETE', '/mood/entries/entry-456')
    })

    it('propagates error if delete fails', async () => {
      const client = createMockClient()
      client.request.mockRejectedValueOnce(new Error('Forbidden'))

      await expect(deleteMoodEntry(client, 'entry-456')).rejects.toThrow('Forbidden')
    })
  })

  describe('getMoodStreak', () => {
    it('fetches streak info from /mood/streak', async () => {
      const client = createMockClient()
      const mockStreak: MoodStreak = {
        current: 7,
        longest: 14,
        isActiveToday: true,
        lastLoggedAt: '2026-09-25T09:00:00Z',
      }
      client.request.mockResolvedValueOnce(mockStreak)

      const result = await getMoodStreak(client)
      expect(client.request).toHaveBeenCalledWith('GET', '/mood/streak')
      expect(result).toEqual(mockStreak)
    })
  })

  describe('getMoodSummary', () => {
    it('fetches summary with default period "week"', async () => {
      const client = createMockClient()
      const mockSummary: MoodSummary = {
        period: 'week',
        averageScore: 7.8,
        totalEntries: 12,
        topTags: [],
        trend: 'improving',
      }
      client.request.mockResolvedValueOnce(mockSummary)

      const result = await getMoodSummary(client)
      expect(client.request).toHaveBeenCalledWith('GET', '/mood/summary?period=week')
      expect(result).toEqual(mockSummary)
    })

    it('fetches summary with custom period', async () => {
      const client = createMockClient()
      client.request.mockResolvedValueOnce({ period: 'month' })

      await getMoodSummary(client, 'month')
      expect(client.request).toHaveBeenCalledWith('GET', '/mood/summary?period=month')
    })
  })

  describe('requestAIReflection & getAIReflection', () => {
    it('triggers reflection generation with POST', async () => {
      const client = createMockClient()
      const mockReflection: AIReflection = {
        id: 'ref-1',
        entryId: 'entry-1',
        reflection: 'You noticed high energy while collaborating.',
        status: 'pending',
        createdAt: '2026-09-25T11:00:00Z',
      }
      client.request.mockResolvedValueOnce(mockReflection)

      const result = await requestAIReflection(client, 'entry-1')
      expect(client.request).toHaveBeenCalledWith('POST', '/mood/entries/entry-1/reflect')
      expect(result).toEqual(mockReflection)
    })

    it('fetches reflection with GET', async () => {
      const client = createMockClient()
      const mockReflection: AIReflection = {
        id: 'ref-1',
        entryId: 'entry-1',
        reflection: 'Completed reflection',
        status: 'ready',
        createdAt: '2026-09-25T11:00:00Z',
      }
      client.request.mockResolvedValueOnce(mockReflection)

      const result = await getAIReflection(client, 'entry-1')
      expect(client.request).toHaveBeenCalledWith('GET', '/mood/entries/entry-1/reflection')
      expect(result).toEqual(mockReflection)
    })
  })
})
