"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
function isPendingAwareJob(dep) {
  return typeof dep === `object` && dep !== null && typeof dep.hasPendingGraphRun === `function`;
}
class Scheduler {
  constructor() {
    this.contexts = /* @__PURE__ */ new Map();
    this.clearListeners = /* @__PURE__ */ new Set();
  }
  /**
   * Get or create the state bucket for a context.
   */
  getOrCreateContext(contextId) {
    let context = this.contexts.get(contextId);
    if (!context) {
      context = {
        queue: [],
        jobs: /* @__PURE__ */ new Map(),
        dependencies: /* @__PURE__ */ new Map(),
        completed: /* @__PURE__ */ new Set()
      };
      this.contexts.set(contextId, context);
    }
    return context;
  }
  /**
   * Schedule work. Without a context id, executes immediately.
   * Otherwise queues the job to be flushed once dependencies are satisfied.
   * Scheduling the same jobId again replaces the previous run function.
   */
  schedule({ contextId, jobId, dependencies, run }) {
    if (typeof contextId === `undefined`) {
      run();
      return;
    }
    const context = this.getOrCreateContext(contextId);
    if (!context.jobs.has(jobId)) {
      context.queue.push(jobId);
    }
    context.jobs.set(jobId, run);
    if (dependencies) {
      const depSet = new Set(dependencies);
      depSet.delete(jobId);
      context.dependencies.set(jobId, depSet);
    } else if (!context.dependencies.has(jobId)) {
      context.dependencies.set(jobId, /* @__PURE__ */ new Set());
    }
    context.completed.delete(jobId);
  }
  /**
   * Flush all queued work for a context. Jobs with unmet dependencies are retried.
   * Throws if a pass completes without running any job (dependency cycle).
   */
  flush(contextId) {
    const context = this.contexts.get(contextId);
    if (!context) return;
    const { queue, jobs, dependencies, completed } = context;
    while (queue.length > 0) {
      let ranThisPass = false;
      const jobsThisPass = queue.length;
      for (let i = 0; i < jobsThisPass; i++) {
        const jobId = queue.shift();
        const run = jobs.get(jobId);
        if (!run) {
          dependencies.delete(jobId);
          completed.delete(jobId);
          continue;
        }
        const deps = dependencies.get(jobId);
        let ready = !deps;
        if (deps) {
          ready = true;
          for (const dep of deps) {
            if (dep === jobId) continue;
            const depHasPending = isPendingAwareJob(dep) && dep.hasPendingGraphRun(contextId);
            if (jobs.has(dep) && !completed.has(dep) || !jobs.has(dep) && depHasPending) {
              ready = false;
              break;
            }
          }
        }
        if (ready) {
          jobs.delete(jobId);
          dependencies.delete(jobId);
          run();
          completed.add(jobId);
          ranThisPass = true;
        } else {
          queue.push(jobId);
        }
      }
      if (!ranThisPass) {
        throw new Error(
          `Scheduler detected unresolved dependencies for context ${String(
            contextId
          )}.`
        );
      }
    }
    this.contexts.delete(contextId);
  }
  /**
   * Flush all contexts with pending work. Useful during tear-down.
   */
  flushAll() {
    for (const contextId of Array.from(this.contexts.keys())) {
      this.flush(contextId);
    }
  }
  /** Clear all scheduled jobs for a context. */
  clear(contextId) {
    this.contexts.delete(contextId);
    this.clearListeners.forEach((listener) => listener(contextId));
  }
  /** Register a listener to be notified when a context is cleared. */
  onClear(listener) {
    this.clearListeners.add(listener);
    return () => this.clearListeners.delete(listener);
  }
  /** Check if a context has pending jobs. */
  hasPendingJobs(contextId) {
    const context = this.contexts.get(contextId);
    return !!context && context.jobs.size > 0;
  }
  /** Remove a single job from a context and clean up its dependencies. */
  clearJob(contextId, jobId) {
    const context = this.contexts.get(contextId);
    if (!context) return;
    context.jobs.delete(jobId);
    context.dependencies.delete(jobId);
    context.completed.delete(jobId);
    context.queue = context.queue.filter((id) => id !== jobId);
    if (context.jobs.size === 0) {
      this.contexts.delete(contextId);
    }
  }
}
const transactionScopedScheduler = new Scheduler();
exports.Scheduler = Scheduler;
exports.transactionScopedScheduler = transactionScopedScheduler;
//# sourceMappingURL=scheduler.cjs.map
