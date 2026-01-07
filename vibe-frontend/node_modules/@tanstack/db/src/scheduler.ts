/**
 * Identifier used to scope scheduled work. Maps to a transaction id for live queries.
 */
export type SchedulerContextId = string | symbol

/**
 * Options for {@link Scheduler.schedule}. Jobs are identified by `jobId` within a context
 * and may declare dependencies.
 */
interface ScheduleOptions {
  contextId?: SchedulerContextId
  jobId: unknown
  dependencies?: Iterable<unknown>
  run: () => void
}

/**
 * State per context. Queue preserves order, jobs hold run functions, dependencies track
 * prerequisites, and completed records which jobs have run during the current flush.
 */
interface SchedulerContextState {
  queue: Array<unknown>
  jobs: Map<unknown, () => void>
  dependencies: Map<unknown, Set<unknown>>
  completed: Set<unknown>
}

interface PendingAwareJob {
  hasPendingGraphRun: (contextId: SchedulerContextId) => boolean
}

function isPendingAwareJob(dep: any): dep is PendingAwareJob {
  return (
    typeof dep === `object` &&
    dep !== null &&
    typeof dep.hasPendingGraphRun === `function`
  )
}

/**
 * Scoped scheduler that coalesces work by context and job.
 *
 * - **context** (e.g. transaction id) defines the batching boundary; work is queued until flushed.
 * - **job id** deduplicates work within a context; scheduling the same job replaces the previous run function.
 * - Without a context id, work executes immediately.
 *
 * Callers manage their own state; the scheduler only orchestrates execution order.
 */
export class Scheduler {
  private contexts = new Map<SchedulerContextId, SchedulerContextState>()
  private clearListeners = new Set<(contextId: SchedulerContextId) => void>()

  /**
   * Get or create the state bucket for a context.
   */
  private getOrCreateContext(
    contextId: SchedulerContextId,
  ): SchedulerContextState {
    let context = this.contexts.get(contextId)
    if (!context) {
      context = {
        queue: [],
        jobs: new Map(),
        dependencies: new Map(),
        completed: new Set(),
      }
      this.contexts.set(contextId, context)
    }
    return context
  }

  /**
   * Schedule work. Without a context id, executes immediately.
   * Otherwise queues the job to be flushed once dependencies are satisfied.
   * Scheduling the same jobId again replaces the previous run function.
   */
  schedule({ contextId, jobId, dependencies, run }: ScheduleOptions): void {
    if (typeof contextId === `undefined`) {
      run()
      return
    }

    const context = this.getOrCreateContext(contextId)

    // If this is a new job, add it to the queue
    if (!context.jobs.has(jobId)) {
      context.queue.push(jobId)
    }

    // Store or replace the run function
    context.jobs.set(jobId, run)

    // Update dependencies
    if (dependencies) {
      const depSet = new Set<unknown>(dependencies)
      depSet.delete(jobId)
      context.dependencies.set(jobId, depSet)
    } else if (!context.dependencies.has(jobId)) {
      context.dependencies.set(jobId, new Set())
    }

    // Clear completion status since we're rescheduling
    context.completed.delete(jobId)
  }

  /**
   * Flush all queued work for a context. Jobs with unmet dependencies are retried.
   * Throws if a pass completes without running any job (dependency cycle).
   */
  flush(contextId: SchedulerContextId): void {
    const context = this.contexts.get(contextId)
    if (!context) return

    const { queue, jobs, dependencies, completed } = context

    while (queue.length > 0) {
      let ranThisPass = false
      const jobsThisPass = queue.length

      for (let i = 0; i < jobsThisPass; i++) {
        const jobId = queue.shift()!
        const run = jobs.get(jobId)
        if (!run) {
          dependencies.delete(jobId)
          completed.delete(jobId)
          continue
        }

        const deps = dependencies.get(jobId)
        let ready = !deps
        if (deps) {
          ready = true
          for (const dep of deps) {
            if (dep === jobId) continue

            const depHasPending =
              isPendingAwareJob(dep) && dep.hasPendingGraphRun(contextId)

            // Treat dependencies as blocking if the dep has a pending run in this
            // context or if it's enqueued and not yet complete. If the dep is
            // neither pending nor enqueued, consider it satisfied to avoid deadlocks
            // on lazy sources that never schedule work.
            if (
              (jobs.has(dep) && !completed.has(dep)) ||
              (!jobs.has(dep) && depHasPending)
            ) {
              ready = false
              break
            }
          }
        }

        if (ready) {
          jobs.delete(jobId)
          dependencies.delete(jobId)
          // Run the job. If it throws, we don't mark it complete, allowing the
          // error to propagate while maintaining scheduler state consistency.
          run()
          completed.add(jobId)
          ranThisPass = true
        } else {
          queue.push(jobId)
        }
      }

      if (!ranThisPass) {
        throw new Error(
          `Scheduler detected unresolved dependencies for context ${String(
            contextId,
          )}.`,
        )
      }
    }

    this.contexts.delete(contextId)
  }

  /**
   * Flush all contexts with pending work. Useful during tear-down.
   */
  flushAll(): void {
    for (const contextId of Array.from(this.contexts.keys())) {
      this.flush(contextId)
    }
  }

  /** Clear all scheduled jobs for a context. */
  clear(contextId: SchedulerContextId): void {
    this.contexts.delete(contextId)
    // Notify listeners that this context was cleared
    this.clearListeners.forEach((listener) => listener(contextId))
  }

  /** Register a listener to be notified when a context is cleared. */
  onClear(listener: (contextId: SchedulerContextId) => void): () => void {
    this.clearListeners.add(listener)
    return () => this.clearListeners.delete(listener)
  }

  /** Check if a context has pending jobs. */
  hasPendingJobs(contextId: SchedulerContextId): boolean {
    const context = this.contexts.get(contextId)
    return !!context && context.jobs.size > 0
  }

  /** Remove a single job from a context and clean up its dependencies. */
  clearJob(contextId: SchedulerContextId, jobId: unknown): void {
    const context = this.contexts.get(contextId)
    if (!context) return

    context.jobs.delete(jobId)
    context.dependencies.delete(jobId)
    context.completed.delete(jobId)
    context.queue = context.queue.filter((id) => id !== jobId)

    if (context.jobs.size === 0) {
      this.contexts.delete(contextId)
    }
  }
}

export const transactionScopedScheduler = new Scheduler()
