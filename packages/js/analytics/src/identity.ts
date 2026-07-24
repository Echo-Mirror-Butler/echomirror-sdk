import type { AnalyticsStorage } from './storage'

export interface IdentitySnapshot {
  anonymousId: string
  userId: string | null
  sessionId: string
}

export class IdentityManager {
  private storage: AnalyticsStorage
  private anonKey: string
  private userKey: string
  private generateId: () => string
  private _anonymousId: string
  private _userId: string | null
  private _sessionId: string

  constructor(
    storage: AnalyticsStorage,
    storageKey: string,
    generateId: () => string,
  ) {
    this.storage = storage
    this.anonKey = `${storageKey}:anonymousId`
    this.userKey = `${storageKey}:userId`
    this.generateId = generateId

    const existingAnon = this.storage.getItem(this.anonKey)
    this._anonymousId = existingAnon ?? this.generateId()
    if (!existingAnon) this.storage.setItem(this.anonKey, this._anonymousId)

    this._userId = this.storage.getItem(this.userKey)
    this._sessionId = this.generateId()
  }

  get anonymousId(): string {
    return this._anonymousId
  }

  get userId(): string | null {
    return this._userId
  }

  get sessionId(): string {
    return this._sessionId
  }

  snapshot(): IdentitySnapshot {
    return {
      anonymousId: this._anonymousId,
      userId: this._userId,
      sessionId: this._sessionId,
    }
  }

  identify(userId: string): { previousAnonymousId: string } {
    const previousAnonymousId = this._anonymousId
    this._userId = userId
    this.storage.setItem(this.userKey, userId)
    return { previousAnonymousId }
  }

  reset(): void {
    this._anonymousId = this.generateId()
    this._userId = null
    this._sessionId = this.generateId()
    this.storage.setItem(this.anonKey, this._anonymousId)
    this.storage.removeItem(this.userKey)
  }
}
