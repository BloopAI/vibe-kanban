"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const errors = require("../errors.cjs");
const subscription = require("./subscription.cjs");
class CollectionChangesManager {
  /**
   * Creates a new CollectionChangesManager instance
   */
  constructor() {
    this.activeSubscribersCount = 0;
    this.changeSubscriptions = /* @__PURE__ */ new Set();
    this.batchedEvents = [];
    this.shouldBatchEvents = false;
  }
  setDeps(deps) {
    this.lifecycle = deps.lifecycle;
    this.sync = deps.sync;
    this.events = deps.events;
    this.collection = deps.collection;
  }
  /**
   * Emit an empty ready event to notify subscribers that the collection is ready
   * This bypasses the normal empty array check in emitEvents
   */
  emitEmptyReadyEvent() {
    for (const subscription2 of this.changeSubscriptions) {
      subscription2.emitEvents([]);
    }
  }
  /**
   * Emit events either immediately or batch them for later emission
   */
  emitEvents(changes, forceEmit = false) {
    if (this.shouldBatchEvents && !forceEmit) {
      this.batchedEvents.push(...changes);
      return;
    }
    let eventsToEmit = changes;
    if (forceEmit) {
      if (this.batchedEvents.length > 0) {
        eventsToEmit = [...this.batchedEvents, ...changes];
      }
      this.batchedEvents = [];
      this.shouldBatchEvents = false;
    }
    if (eventsToEmit.length === 0) {
      return;
    }
    for (const subscription2 of this.changeSubscriptions) {
      subscription2.emitEvents(eventsToEmit);
    }
  }
  /**
   * Subscribe to changes in the collection
   */
  subscribeChanges(callback, options = {}) {
    this.addSubscriber();
    const subscription$1 = new subscription.CollectionSubscription(this.collection, callback, {
      ...options,
      onUnsubscribe: () => {
        this.removeSubscriber();
        this.changeSubscriptions.delete(subscription$1);
      }
    });
    if (options.includeInitialState) {
      subscription$1.requestSnapshot({ trackLoadSubsetPromise: false });
    } else if (options.includeInitialState === false) {
      subscription$1.markAllStateAsSeen();
    }
    this.changeSubscriptions.add(subscription$1);
    return subscription$1;
  }
  /**
   * Increment the active subscribers count and start sync if needed
   */
  addSubscriber() {
    const previousSubscriberCount = this.activeSubscribersCount;
    this.activeSubscribersCount++;
    this.lifecycle.cancelGCTimer();
    if (this.lifecycle.status === `cleaned-up` || this.lifecycle.status === `idle`) {
      this.sync.startSync();
    }
    this.events.emitSubscribersChange(
      this.activeSubscribersCount,
      previousSubscriberCount
    );
  }
  /**
   * Decrement the active subscribers count and start GC timer if needed
   */
  removeSubscriber() {
    const previousSubscriberCount = this.activeSubscribersCount;
    this.activeSubscribersCount--;
    if (this.activeSubscribersCount === 0) {
      this.lifecycle.startGCTimer();
    } else if (this.activeSubscribersCount < 0) {
      throw new errors.NegativeActiveSubscribersError();
    }
    this.events.emitSubscribersChange(
      this.activeSubscribersCount,
      previousSubscriberCount
    );
  }
  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  cleanup() {
    this.batchedEvents = [];
    this.shouldBatchEvents = false;
  }
}
exports.CollectionChangesManager = CollectionChangesManager;
//# sourceMappingURL=changes.cjs.map
