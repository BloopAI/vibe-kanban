import {
  CollectionInErrorStateError,
  CollectionStateError,
  InvalidCollectionStatusTransitionError,
} from '../errors'
import {
  safeCancelIdleCallback,
  safeRequestIdleCallback,
} from '../utils/browser-polyfills'
import type { IdleCallbackDeadline } from '../utils/browser-polyfills'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CollectionConfig, CollectionStatus } from '../types'
import type { CollectionEventsManager } from './events'
import type { CollectionIndexesManager } from './indexes'
import type { CollectionChangesManager } from './changes'
import type { CollectionSyncManager } from './sync'
import type { CollectionStateManager } from './state'

export class CollectionLifecycleManager<
  TOutput extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TInput extends object = TOutput,
> {
  private config: CollectionConfig<TOutput, TKey, TSchema>
  private id: string
  private indexes!: CollectionIndexesManager<TOutput, TKey, TSchema, TInput>
  private events!: CollectionEventsManager
  private changes!: CollectionChangesManager<TOutput, TKey, TSchema, TInput>
  private sync!: CollectionSyncManager<TOutput, TKey, TSchema, TInput>
  private state!: CollectionStateManager<TOutput, TKey, TSchema, TInput>

  public status: CollectionStatus = `idle`
  public hasBeenReady = false
  public hasReceivedFirstCommit = false
  public onFirstReadyCallbacks: Array<() => void> = []
  public gcTimeoutId: ReturnType<typeof setTimeout> | null = null
  private idleCallbackId: number | null = null

  /**
   * Creates a new CollectionLifecycleManager instance
   */
  constructor(config: CollectionConfig<TOutput, TKey, TSchema>, id: string) {
    this.config = config
    this.id = id
  }

  setDeps(deps: {
    indexes: CollectionIndexesManager<TOutput, TKey, TSchema, TInput>
    events: CollectionEventsManager
    changes: CollectionChangesManager<TOutput, TKey, TSchema, TInput>
    sync: CollectionSyncManager<TOutput, TKey, TSchema, TInput>
    state: CollectionStateManager<TOutput, TKey, TSchema, TInput>
  }) {
    this.indexes = deps.indexes
    this.events = deps.events
    this.changes = deps.changes
    this.sync = deps.sync
    this.state = deps.state
  }

  /**
   * Validates state transitions to prevent invalid status changes
   */
  public validateStatusTransition(
    from: CollectionStatus,
    to: CollectionStatus,
  ): void {
    if (from === to) {
      // Allow same state transitions
      return
    }
    const validTransitions: Record<
      CollectionStatus,
      Array<CollectionStatus>
    > = {
      idle: [`loading`, `error`, `cleaned-up`],
      loading: [`ready`, `error`, `cleaned-up`],
      ready: [`cleaned-up`, `error`],
      error: [`cleaned-up`, `idle`],
      'cleaned-up': [`loading`, `error`],
    }

    if (!validTransitions[from].includes(to)) {
      throw new InvalidCollectionStatusTransitionError(from, to, this.id)
    }
  }

  /**
   * Safely update the collection status with validation
   * @private
   */
  public setStatus(
    newStatus: CollectionStatus,
    allowReady: boolean = false,
  ): void {
    if (newStatus === `ready` && !allowReady) {
      // setStatus('ready') is an internal method that should not be called directly
      // Instead, use markReady to transition to ready triggering the necessary events
      // and side effects.
      throw new CollectionStateError(
        `You can't directly call "setStatus('ready'). You must use markReady instead.`,
      )
    }
    this.validateStatusTransition(this.status, newStatus)
    const previousStatus = this.status
    this.status = newStatus

    // Resolve indexes when collection becomes ready
    if (newStatus === `ready` && !this.indexes.isIndexesResolved) {
      // Resolve indexes asynchronously without blocking
      this.indexes.resolveAllIndexes().catch((error) => {
        console.warn(
          `${this.config.id ? `[${this.config.id}] ` : ``}Failed to resolve indexes:`,
          error,
        )
      })
    }

    // Emit event
    this.events.emitStatusChange(newStatus, previousStatus)
  }

  /**
   * Validates that the collection is in a usable state for data operations
   * @private
   */
  public validateCollectionUsable(operation: string): void {
    switch (this.status) {
      case `error`:
        throw new CollectionInErrorStateError(operation, this.id)
      case `cleaned-up`:
        // Automatically restart the collection when operations are called on cleaned-up collections
        this.sync.startSync()
        break
    }
  }

  /**
   * Mark the collection as ready for use
   * This is called by sync implementations to explicitly signal that the collection is ready,
   * providing a more intuitive alternative to using commits for readiness signaling
   * @private - Should only be called by sync implementations
   */
  public markReady(): void {
    this.validateStatusTransition(this.status, `ready`)
    // Can transition to ready from loading state
    if (this.status === `loading`) {
      this.setStatus(`ready`, true)

      // Call any registered first ready callbacks (only on first time becoming ready)
      if (!this.hasBeenReady) {
        this.hasBeenReady = true

        // Also mark as having received first commit for backwards compatibility
        if (!this.hasReceivedFirstCommit) {
          this.hasReceivedFirstCommit = true
        }

        const callbacks = [...this.onFirstReadyCallbacks]
        this.onFirstReadyCallbacks = []
        callbacks.forEach((callback) => callback())
      }
      // Notify dependents when markReady is called, after status is set
      // This ensures live queries get notified when their dependencies become ready
      if (this.changes.changeSubscriptions.size > 0) {
        this.changes.emitEmptyReadyEvent()
      }
    }
  }

  /**
   * Start the garbage collection timer
   * Called when the collection becomes inactive (no subscribers)
   */
  public startGCTimer(): void {
    if (this.gcTimeoutId) {
      clearTimeout(this.gcTimeoutId)
    }

    const gcTime = this.config.gcTime ?? 300000 // 5 minutes default

    // If gcTime is 0, GC is disabled
    if (gcTime === 0) {
      return
    }

    this.gcTimeoutId = setTimeout(() => {
      if (this.changes.activeSubscribersCount === 0) {
        // Schedule cleanup during idle time to avoid blocking the UI thread
        this.scheduleIdleCleanup()
      }
    }, gcTime)
  }

  /**
   * Cancel the garbage collection timer
   * Called when the collection becomes active again
   */
  public cancelGCTimer(): void {
    if (this.gcTimeoutId) {
      clearTimeout(this.gcTimeoutId)
      this.gcTimeoutId = null
    }
    // Also cancel any pending idle cleanup
    if (this.idleCallbackId !== null) {
      safeCancelIdleCallback(this.idleCallbackId)
      this.idleCallbackId = null
    }
  }

  /**
   * Schedule cleanup to run during browser idle time
   * This prevents blocking the UI thread during cleanup operations
   */
  private scheduleIdleCleanup(): void {
    // Cancel any existing idle callback
    if (this.idleCallbackId !== null) {
      safeCancelIdleCallback(this.idleCallbackId)
    }

    // Schedule cleanup with a timeout of 1 second
    // This ensures cleanup happens even if the browser is busy
    this.idleCallbackId = safeRequestIdleCallback(
      (deadline) => {
        // Perform cleanup if we still have no subscribers
        if (this.changes.activeSubscribersCount === 0) {
          const cleanupCompleted = this.performCleanup(deadline)
          // Only clear the callback ID if cleanup actually completed
          if (cleanupCompleted) {
            this.idleCallbackId = null
          }
        } else {
          // No need to cleanup, clear the callback ID
          this.idleCallbackId = null
        }
      },
      { timeout: 1000 },
    )
  }

  /**
   * Perform cleanup operations, optionally in chunks during idle time
   * @returns true if cleanup was completed, false if it was rescheduled
   */
  private performCleanup(deadline?: IdleCallbackDeadline): boolean {
    // If we have a deadline, we can potentially split cleanup into chunks
    // For now, we'll do all cleanup at once but check if we have time
    const hasTime =
      !deadline || deadline.timeRemaining() > 0 || deadline.didTimeout

    if (hasTime) {
      // Perform all cleanup operations except events
      this.sync.cleanup()
      this.state.cleanup()
      this.changes.cleanup()
      this.indexes.cleanup()

      if (this.gcTimeoutId) {
        clearTimeout(this.gcTimeoutId)
        this.gcTimeoutId = null
      }

      this.hasBeenReady = false
      this.onFirstReadyCallbacks = []

      // Set status to cleaned-up after everything is cleaned up
      // This fires the status:change event to notify listeners
      this.setStatus(`cleaned-up`)

      // Finally, cleanup event handlers after the event has been fired
      this.events.cleanup()

      return true
    } else {
      // If we don't have time, reschedule for the next idle period
      this.scheduleIdleCleanup()
      return false
    }
  }

  /**
   * Register a callback to be executed when the collection first becomes ready
   * Useful for preloading collections
   * @param callback Function to call when the collection first becomes ready
   */
  public onFirstReady(callback: () => void): void {
    // If already ready, call immediately
    if (this.hasBeenReady) {
      callback()
      return
    }

    this.onFirstReadyCallbacks.push(callback)
  }

  public cleanup(): void {
    // Cancel any pending idle cleanup
    if (this.idleCallbackId !== null) {
      safeCancelIdleCallback(this.idleCallbackId)
      this.idleCallbackId = null
    }

    // Perform cleanup immediately (used when explicitly called)
    this.performCleanup()
  }
}
