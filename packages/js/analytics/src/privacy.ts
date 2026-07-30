import type { JsonValue, MoodCategory, MoodLoggedProperties } from './types.js'

const SENSITIVE_KEYS = new Set([
  'address',
  'content',
  'displayname',
  'email',
  'fullname',
  'message',
  'name',
  'note',
  'notes',
  'phone',
  'prompt',
  'reflection',
  'tag',
  'tags',
  'walletaddress',
])

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function toJsonValue(
  value: unknown,
  seen: WeakSet<object>,
  allowSensitiveProperties: boolean,
): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined
    seen.add(value)
    const result = value
      .map((item) => toJsonValue(item, seen, allowSensitiveProperties))
      .filter((item): item is JsonValue => item !== undefined)
    seen.delete(value)
    return result
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return undefined
    seen.add(value)
    const result: Record<string, JsonValue> = {}
    for (const [key, child] of Object.entries(value)) {
      if (!allowSensitiveProperties && SENSITIVE_KEYS.has(normalizedKey(key))) continue
      const json = toJsonValue(child, seen, allowSensitiveProperties)
      if (json !== undefined) result[key] = json
    }
    seen.delete(value)
    return result
  }

  return undefined
}

function sanitizeObject(
  properties: Record<string, unknown>,
  allowSensitiveProperties: boolean,
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {}
  const seen = new WeakSet<object>()

  for (const [key, value] of Object.entries(properties)) {
    if (!allowSensitiveProperties && SENSITIVE_KEYS.has(normalizedKey(key))) continue
    const json = toJsonValue(value, seen, allowSensitiveProperties)
    if (json !== undefined) result[key] = json
  }

  return result
}

export function moodCategory(score: number): MoodCategory {
  if (score <= 2) return 'very_low'
  if (score <= 4) return 'low'
  if (score <= 6) return 'neutral'
  if (score <= 8) return 'good'
  return 'excellent'
}

export function sanitizeProperties(
  eventName: string,
  properties: Record<string, unknown>,
  allowSensitiveProperties: boolean,
): Record<string, JsonValue> {
  if (allowSensitiveProperties) return sanitizeObject(properties, true)

  if (eventName === 'mood_logged') {
    const mood = properties as unknown as MoodLoggedProperties
    const safe = sanitizeObject(properties, false)
    if (typeof mood.score === 'number' && Number.isFinite(mood.score)) {
      safe.score = mood.score
      safe.moodCategory = moodCategory(mood.score)
    }
    safe.hasNote = typeof mood.note === 'string' && mood.note.length > 0
    safe.tagCount = Array.isArray(mood.tags) ? mood.tags.length : 0
    return safe
  }

  return sanitizeObject(properties, false)
}
