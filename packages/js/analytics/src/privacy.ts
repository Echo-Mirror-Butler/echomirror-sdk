import type { AnalyticsProperties, PrivacyMode } from './types'

export const SENSITIVE_PROPERTY_KEYS: readonly string[] = [
  'note',
  'notes',
  'rawnote',
  'tag',
  'tags',
  'content',
  'text',
  'body',
  'comment',
  'message',
  'description',
  'title',
]

const sensitiveSet = new Set<string>(SENSITIVE_PROPERTY_KEYS)

export function isSensitiveKey(key: string): boolean {
  return sensitiveSet.has(key.toLowerCase())
}

export function sanitizeProperties(
  properties: AnalyticsProperties,
  mode: PrivacyMode,
): AnalyticsProperties {
  if (mode === 'full') return { ...properties }
  const clean: AnalyticsProperties = {}
  for (const key of Object.keys(properties)) {
    if (isSensitiveKey(key)) continue
    clean[key] = properties[key]
  }
  return clean
}
