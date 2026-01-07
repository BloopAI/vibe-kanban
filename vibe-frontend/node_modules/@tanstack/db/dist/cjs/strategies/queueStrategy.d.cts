import { QueueStrategy, QueueStrategyOptions } from './types.cjs';
/**
 * Creates a queue strategy that processes all mutations in order with proper serialization.
 *
 * Unlike other strategies that may drop executions, queue ensures every
 * mutation is processed sequentially. Each transaction commit completes before
 * the next one starts. Useful when data consistency is critical and
 * every operation must complete in order.
 *
 * @param options - Configuration for queue behavior (FIFO/LIFO, timing, size limits)
 * @returns A queue strategy instance
 *
 * @example
 * ```ts
 * // FIFO queue - process in order received
 * const mutate = usePacedMutations({
 *   mutationFn: async ({ transaction }) => {
 *     await api.save(transaction.mutations)
 *   },
 *   strategy: queueStrategy({
 *     wait: 200,
 *     addItemsTo: 'back',
 *     getItemsFrom: 'front'
 *   })
 * })
 * ```
 *
 * @example
 * ```ts
 * // LIFO queue - process most recent first
 * const mutate = usePacedMutations({
 *   mutationFn: async ({ transaction }) => {
 *     await api.save(transaction.mutations)
 *   },
 *   strategy: queueStrategy({
 *     wait: 200,
 *     addItemsTo: 'back',
 *     getItemsFrom: 'back'
 *   })
 * })
 * ```
 */
export declare function queueStrategy(options?: QueueStrategyOptions): QueueStrategy;
