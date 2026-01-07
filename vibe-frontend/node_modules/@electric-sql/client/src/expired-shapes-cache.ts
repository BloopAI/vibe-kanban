interface ExpiredShapeCacheEntry {
  expiredHandle: string
  lastUsed: number
}

/**
 * LRU cache for tracking expired shapes with automatic cleanup
 */
export class ExpiredShapesCache {
  private data: Record<string, ExpiredShapeCacheEntry> = {}
  private max: number = 250
  private readonly storageKey = `electric_expired_shapes`

  getExpiredHandle(shapeUrl: string): string | null {
    const entry = this.data[shapeUrl]
    if (entry) {
      // Update last used time when accessed
      entry.lastUsed = Date.now()
      this.save()
      return entry.expiredHandle
    }
    return null
  }

  markExpired(shapeUrl: string, handle: string): void {
    this.data[shapeUrl] = { expiredHandle: handle, lastUsed: Date.now() }

    const keys = Object.keys(this.data)
    if (keys.length > this.max) {
      const oldest = keys.reduce((min, k) =>
        this.data[k].lastUsed < this.data[min].lastUsed ? k : min
      )
      delete this.data[oldest]
    }

    this.save()
  }

  private save(): void {
    if (typeof localStorage === `undefined`) return
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data))
    } catch {
      // Ignore localStorage errors
    }
  }

  private load(): void {
    if (typeof localStorage === `undefined`) return
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        this.data = JSON.parse(stored)
      }
    } catch {
      // Ignore localStorage errors, start fresh
      this.data = {}
    }
  }

  constructor() {
    this.load()
  }

  clear(): void {
    this.data = {}
    this.save()
  }
}

// Module-level singleton instance
export const expiredShapesCache = new ExpiredShapesCache()
