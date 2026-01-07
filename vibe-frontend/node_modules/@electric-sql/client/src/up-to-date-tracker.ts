interface UpToDateEntry {
  timestamp: number
  cursor: string
}

/**
 * Tracks up-to-date messages to detect when we're replaying cached responses.
 *
 * When a shape receives an up-to-date, we record the timestamp and cursor in localStorage.
 * On page refresh, if we find a recent timestamp (< 60s), we know we'll be replaying
 * cached responses. We suppress their up-to-date notifications until we see a NEW cursor
 * (different from the last recorded one), which indicates fresh data from the server.
 *
 * localStorage writes are throttled to once per 60 seconds to avoid performance issues
 * with frequent updates. In-memory data is always kept current.
 */
export class UpToDateTracker {
  private data: Record<string, UpToDateEntry> = {}
  private readonly storageKey = `electric_up_to_date_tracker`
  private readonly cacheTTL = 60_000 // 60s to match typical CDN s-maxage cache duration
  private readonly maxEntries = 250
  private readonly writeThrottleMs = 60_000 // Throttle localStorage writes to once per 60s
  private lastWriteTime = 0
  private pendingSaveTimer?: ReturnType<typeof setTimeout>

  constructor() {
    this.load()
    this.cleanup()
  }

  /**
   * Records that a shape received an up-to-date message with a specific cursor.
   * This timestamp and cursor are used to detect cache replay scenarios.
   * Updates in-memory immediately, but throttles localStorage writes.
   */
  recordUpToDate(shapeKey: string, cursor: string): void {
    this.data[shapeKey] = {
      timestamp: Date.now(),
      cursor,
    }

    // Implement LRU eviction if we exceed max entries
    const keys = Object.keys(this.data)
    if (keys.length > this.maxEntries) {
      const oldest = keys.reduce((min, k) =>
        this.data[k].timestamp < this.data[min].timestamp ? k : min
      )
      delete this.data[oldest]
    }

    this.scheduleSave()
  }

  /**
   * Schedules a throttled save to localStorage.
   * Writes immediately if enough time has passed, otherwise schedules for later.
   */
  private scheduleSave(): void {
    const now = Date.now()
    const timeSinceLastWrite = now - this.lastWriteTime

    if (timeSinceLastWrite >= this.writeThrottleMs) {
      // Enough time has passed, write immediately
      this.lastWriteTime = now
      this.save()
    } else if (!this.pendingSaveTimer) {
      // Schedule a write for when the throttle period expires
      const delay = this.writeThrottleMs - timeSinceLastWrite
      this.pendingSaveTimer = setTimeout(() => {
        this.lastWriteTime = Date.now()
        this.pendingSaveTimer = undefined
        this.save()
      }, delay)
    }
    // else: a save is already scheduled, no need to do anything
  }

  /**
   * Checks if we should enter replay mode for this shape.
   * Returns the last seen cursor if there's a recent up-to-date (< 60s),
   * which means we'll likely be replaying cached responses.
   * Returns null if no recent up-to-date exists.
   */
  shouldEnterReplayMode(shapeKey: string): string | null {
    const entry = this.data[shapeKey]
    if (!entry) {
      return null
    }

    const age = Date.now() - entry.timestamp
    if (age >= this.cacheTTL) {
      return null
    }

    return entry.cursor
  }

  /**
   * Cleans up expired entries from the cache.
   * Called on initialization and can be called periodically.
   */
  private cleanup(): void {
    const now = Date.now()
    const keys = Object.keys(this.data)
    let modified = false

    for (const key of keys) {
      const age = now - this.data[key].timestamp
      if (age > this.cacheTTL) {
        delete this.data[key]
        modified = true
      }
    }

    if (modified) {
      this.save()
    }
  }

  private save(): void {
    if (typeof localStorage === `undefined`) return
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data))
    } catch {
      // Ignore localStorage errors (quota exceeded, etc.)
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

  /**
   * Clears all tracked up-to-date timestamps.
   * Useful for testing or manual cache invalidation.
   */
  clear(): void {
    this.data = {}
    if (this.pendingSaveTimer) {
      clearTimeout(this.pendingSaveTimer)
      this.pendingSaveTimer = undefined
    }
    this.save()
  }
}

// Module-level singleton instance
export const upToDateTracker = new UpToDateTracker()
