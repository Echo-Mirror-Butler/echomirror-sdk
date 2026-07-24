import type { AnalyticsEvent } from './types'
import type { AnalyticsStorage } from './storage'

export class PersistentQueue {
  private storage: AnalyticsStorage
  private key: string
  private items: AnalyticsEvent[]

  constructor(storage: AnalyticsStorage, key: string) {
    this.storage = storage
    this.key = key
    this.items = this.load()
  }

  private load(): AnalyticsEvent[] {
    const raw = this.storage.getItem(this.key)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as AnalyticsEvent[]) : []
    } catch {
      return []
    }
  }

  private persist(): void {
    this.storage.setItem(this.key, JSON.stringify(this.items))
  }

  enqueue(event: AnalyticsEvent): void {
    this.items.push(event)
    this.persist()
  }

  size(): number {
    return this.items.length
  }

  all(): AnalyticsEvent[] {
    return [...this.items]
  }

  remove(messageIds: string[]): void {
    const removeSet = new Set(messageIds)
    this.items = this.items.filter((event) => !removeSet.has(event.messageId))
    this.persist()
  }

  applyUserId(userId: string): void {
    let changed = false
    for (const item of this.items) {
      if (item.userId === null) {
        item.userId = userId
        changed = true
      }
    }
    if (changed) this.persist()
  }

  clear(): void {
    this.items = []
    this.persist()
  }
}
