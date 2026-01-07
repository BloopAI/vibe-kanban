import { InvalidCollectionStatusTransitionError, CollectionStateError, CollectionInErrorStateError } from "../errors.js";
import { safeCancelIdleCallback, safeRequestIdleCallback } from "../utils/browser-polyfills.js";
class CollectionLifecycleManager {
  /**
   * Creates a new CollectionLifecycleManager instance
   */
  constructor(config, id) {
    this.status = `idle`;
    this.hasBeenReady = false;
    this.hasReceivedFirstCommit = false;
    this.onFirstReadyCallbacks = [];
    this.gcTimeoutId = null;
    this.idleCallbackId = null;
    this.config = config;
    this.id = id;
  }
  setDeps(deps) {
    this.indexes = deps.indexes;
    this.events = deps.events;
    this.changes = deps.changes;
    this.sync = deps.sync;
    this.state = deps.state;
  }
  /**
   * Validates state transitions to prevent invalid status changes
   */
  validateStatusTransition(from, to) {
    if (from === to) {
      return;
    }
    const validTransitions = {
      idle: [`loading`, `error`, `cleaned-up`],
      loading: [`ready`, `error`, `cleaned-up`],
      ready: [`cleaned-up`, `error`],
      error: [`cleaned-up`, `idle`],
      "cleaned-up": [`loading`, `error`]
    };
    if (!validTransitions[from].includes(to)) {
      throw new InvalidCollectionStatusTransitionError(from, to, this.id);
    }
  }
  /**
   * Safely update the collection status with validation
   * @private
   */
  setStatus(newStatus, allowReady = false) {
    if (newStatus === `ready` && !allowReady) {
      throw new CollectionStateError(
        `You can't directly call "setStatus('ready'). You must use markReady instead.`
      );
    }
    this.validateStatusTransition(this.status, newStatus);
    const previousStatus = this.status;
    this.status = newStatus;
    if (newStatus === `ready` && !this.indexes.isIndexesResolved) {
      this.indexes.resolveAllIndexes().catch((error) => {
        console.warn(
          `${this.config.id ? `[${this.config.id}] ` : ``}Failed to resolve indexes:`,
          error
        );
      });
    }
    this.events.emitStatusChange(newStatus, previousStatus);
  }
  /**
   * Validates that the collection is in a usable state for data operations
   * @private
   */
  validateCollectionUsable(operation) {
    switch (this.status) {
      case `error`:
        throw new CollectionInErrorStateError(operation, this.id);
      case `cleaned-up`:
        this.sync.startSync();
        break;
    }
  }
  /**
   * Mark the collection as ready for use
   * This is called by sync implementations to explicitly signal that the collection is ready,
   * providing a more intuitive alternative to using commits for readiness signaling
   * @private - Should only be called by sync implementations
   */
  markReady() {
    this.validateStatusTransition(this.status, `ready`);
    if (this.status === `loading`) {
      this.setStatus(`ready`, true);
      if (!this.hasBeenReady) {
        this.hasBeenReady = true;
        if (!this.hasReceivedFirstCommit) {
          this.hasReceivedFirstCommit = true;
        }
        const callbacks = [...this.onFirstReadyCallbacks];
        this.onFirstReadyCallbacks = [];
        callbacks.forEach((callback) => callback());
      }
      if (this.changes.changeSubscriptions.size > 0) {
        this.changes.emitEmptyReadyEvent();
      }
    }
  }
  /**
   * Start the garbage collection timer
   * Called when the collection becomes inactive (no subscribers)
   */
  startGCTimer() {
    if (this.gcTimeoutId) {
      clearTimeout(this.gcTimeoutId);
    }
    const gcTime = this.config.gcTime ?? 3e5;
    if (gcTime === 0) {
      return;
    }
    this.gcTimeoutId = setTimeout(() => {
      if (this.changes.activeSubscribersCount === 0) {
        this.scheduleIdleCleanup();
      }
    }, gcTime);
  }
  /**
   * Cancel the garbage collection timer
   * Called when the collection becomes active again
   */
  cancelGCTimer() {
    if (this.gcTimeoutId) {
      clearTimeout(this.gcTimeoutId);
      this.gcTimeoutId = null;
    }
    if (this.idleCallbackId !== null) {
      safeCancelIdleCallback(this.idleCallbackId);
      this.idleCallbackId = null;
    }
  }
  /**
   * Schedule cleanup to run during browser idle time
   * This prevents blocking the UI thread during cleanup operations
   */
  scheduleIdleCleanup() {
    if (this.idleCallbackId !== null) {
      safeCancelIdleCallback(this.idleCallbackId);
    }
    this.idleCallbackId = safeRequestIdleCallback(
      (deadline) => {
        if (this.changes.activeSubscribersCount === 0) {
          const cleanupCompleted = this.performCleanup(deadline);
          if (cleanupCompleted) {
            this.idleCallbackId = null;
          }
        } else {
          this.idleCallbackId = null;
        }
      },
      { timeout: 1e3 }
    );
  }
  /**
   * Perform cleanup operations, optionally in chunks during idle time
   * @returns true if cleanup was completed, false if it was rescheduled
   */
  performCleanup(deadline) {
    const hasTime = !deadline || deadline.timeRemaining() > 0 || deadline.didTimeout;
    if (hasTime) {
      this.sync.cleanup();
      this.state.cleanup();
      this.changes.cleanup();
      this.indexes.cleanup();
      if (this.gcTimeoutId) {
        clearTimeout(this.gcTimeoutId);
        this.gcTimeoutId = null;
      }
      this.hasBeenReady = false;
      this.onFirstReadyCallbacks = [];
      this.setStatus(`cleaned-up`);
      this.events.cleanup();
      return true;
    } else {
      this.scheduleIdleCleanup();
      return false;
    }
  }
  /**
   * Register a callback to be executed when the collection first becomes ready
   * Useful for preloading collections
   * @param callback Function to call when the collection first becomes ready
   */
  onFirstReady(callback) {
    if (this.hasBeenReady) {
      callback();
      return;
    }
    this.onFirstReadyCallbacks.push(callback);
  }
  cleanup() {
    if (this.idleCallbackId !== null) {
      safeCancelIdleCallback(this.idleCallbackId);
      this.idleCallbackId = null;
    }
    this.performCleanup();
  }
}
export {
  CollectionLifecycleManager
};
//# sourceMappingURL=lifecycle.js.map
