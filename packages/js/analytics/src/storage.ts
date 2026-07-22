export interface AnalyticsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class MemoryStorage implements AnalyticsStorage {
  private data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }
}

export function resolveStorage(explicit?: AnalyticsStorage): AnalyticsStorage {
  if (explicit) return explicit
  try {
    const g = globalThis as { localStorage?: AnalyticsStorage }
    if (g.localStorage && typeof g.localStorage.getItem === 'function') {
      return g.localStorage
    }
  } catch {
    return new MemoryStorage()
  }
  return new MemoryStorage()
}
