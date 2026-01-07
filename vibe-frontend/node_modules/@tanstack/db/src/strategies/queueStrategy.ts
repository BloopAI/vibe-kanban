import { LiteQueuer } from '@tanstack/pacer-lite/lite-queuer'
import type { QueueStrategy, QueueStrategyOptions } from './types'
import type { Transaction } from '../transactions'

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
export function queueStrategy(options?: QueueStrategyOptions): QueueStrategy {
  // Manual promise chaining to ensure async serialization
  // LiteQueuer (unlike AsyncQueuer from @tanstack/pacer) lacks built-in async queue
  // primitives and concurrency control. We compensate by manually chaining promises
  // to ensure each transaction completes before the next one starts.
  let processingChain = Promise.resolve()

  const queuer = new LiteQueuer<() => Transaction>(
    (fn) => {
      // Chain each transaction to the previous one's completion
      processingChain = processingChain
        .then(async () => {
          const transaction = fn()
          // Wait for the transaction to be persisted before processing next item
          await transaction.isPersisted.promise
        })
        .catch(() => {
          // Errors are handled via transaction.isPersisted.promise and surfaced there.
          // This catch prevents unhandled promise rejections from breaking the chain,
          // ensuring subsequent transactions can still execute even if one fails.
        })
    },
    {
      wait: options?.wait ?? 0,
      maxSize: options?.maxSize,
      addItemsTo: options?.addItemsTo ?? `back`, // Default FIFO: add to back
      getItemsFrom: options?.getItemsFrom ?? `front`, // Default FIFO: get from front
      started: true, // Start processing immediately
    },
  )

  return {
    _type: `queue`,
    options,
    execute: <T extends object = Record<string, unknown>>(
      fn: () => Transaction<T>,
    ) => {
      // Add the transaction-creating function to the queue
      queuer.addItem(fn as () => Transaction)
    },
    cleanup: () => {
      queuer.stop()
      queuer.clear()
    },
  }
}
