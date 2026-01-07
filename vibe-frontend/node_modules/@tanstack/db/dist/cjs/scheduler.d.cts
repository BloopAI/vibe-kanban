/**
 * Identifier used to scope scheduled work. Maps to a transaction id for live queries.
 */
export type SchedulerContextId = string | symbol;
/**
 * Options for {@link Scheduler.schedule}. Jobs are identified by `jobId` within a context
 * and may declare dependencies.
 */
interface ScheduleOptions {
    contextId?: SchedulerContextId;
    jobId: unknown;
    dependencies?: Iterable<unknown>;
    run: () => void;
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
export declare class Scheduler {
    private contexts;
    private clearListeners;
    /**
     * Get or create the state bucket for a context.
     */
    private getOrCreateContext;
    /**
     * Schedule work. Without a context id, executes immediately.
     * Otherwise queues the job to be flushed once dependencies are satisfied.
     * Scheduling the same jobId again replaces the previous run function.
     */
    schedule({ contextId, jobId, dependencies, run }: ScheduleOptions): void;
    /**
     * Flush all queued work for a context. Jobs with unmet dependencies are retried.
     * Throws if a pass completes without running any job (dependency cycle).
     */
    flush(contextId: SchedulerContextId): void;
    /**
     * Flush all contexts with pending work. Useful during tear-down.
     */
    flushAll(): void;
    /** Clear all scheduled jobs for a context. */
    clear(contextId: SchedulerContextId): void;
    /** Register a listener to be notified when a context is cleared. */
    onClear(listener: (contextId: SchedulerContextId) => void): () => void;
    /** Check if a context has pending jobs. */
    hasPendingJobs(contextId: SchedulerContextId): boolean;
    /** Remove a single job from a context and clean up its dependencies. */
    clearJob(contextId: SchedulerContextId, jobId: unknown): void;
}
export declare const transactionScopedScheduler: Scheduler;
export {};
