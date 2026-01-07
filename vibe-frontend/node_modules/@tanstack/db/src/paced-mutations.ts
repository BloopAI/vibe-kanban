import { createTransaction } from './transactions'
import type { MutationFn, Transaction } from './types'
import type { Strategy } from './strategies/types'

/**
 * Configuration for creating a paced mutations manager
 */
export interface PacedMutationsConfig<
  TVariables = unknown,
  T extends object = Record<string, unknown>,
> {
  /**
   * Callback to apply optimistic updates immediately.
   * Receives the variables passed to the mutate function.
   */
  onMutate: (variables: TVariables) => void
  /**
   * Function to execute the mutation on the server.
   * Receives the transaction parameters containing all merged mutations.
   */
  mutationFn: MutationFn<T>
  /**
   * Strategy for controlling mutation execution timing
   * Examples: debounceStrategy, queueStrategy, throttleStrategy
   */
  strategy: Strategy
  /**
   * Custom metadata to associate with transactions
   */
  metadata?: Record<string, unknown>
}

/**
 * Creates a paced mutations manager with pluggable timing strategies.
 *
 * This function provides a way to control when and how optimistic mutations
 * are persisted to the backend, using strategies like debouncing, queuing,
 * or throttling. The optimistic updates are applied immediately via `onMutate`,
 * and the actual persistence is controlled by the strategy.
 *
 * The returned function accepts variables of type TVariables and returns a
 * Transaction object that can be awaited to know when persistence completes
 * or to handle errors.
 *
 * @param config - Configuration including onMutate, mutationFn and strategy
 * @returns A function that accepts variables and returns a Transaction
 *
 * @example
 * ```ts
 * // Debounced mutations for auto-save
 * const updateTodo = createPacedMutations<string>({
 *   onMutate: (text) => {
 *     // Apply optimistic update immediately
 *     collection.update(id, draft => { draft.text = text })
 *   },
 *   mutationFn: async ({ transaction }) => {
 *     await api.save(transaction.mutations)
 *   },
 *   strategy: debounceStrategy({ wait: 500 })
 * })
 *
 * // Call with variables, returns a transaction
 * const tx = updateTodo('New text')
 *
 * // Await persistence or handle errors
 * await tx.isPersisted.promise
 * ```
 *
 * @example
 * ```ts
 * // Queue strategy for sequential processing
 * const addTodo = createPacedMutations<{ text: string }>({
 *   onMutate: ({ text }) => {
 *     collection.insert({ id: uuid(), text, completed: false })
 *   },
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
 */
export function createPacedMutations<
  TVariables = unknown,
  T extends object = Record<string, unknown>,
>(
  config: PacedMutationsConfig<TVariables, T>,
): (variables: TVariables) => Transaction<T> {
  const { onMutate, mutationFn, strategy, ...transactionConfig } = config

  // The currently active transaction (pending, not yet persisting)
  let activeTransaction: Transaction<T> | null = null

  // Commit callback that the strategy will call when it's time to persist
  const commitCallback = () => {
    if (!activeTransaction) {
      throw new Error(
        `Strategy callback called but no active transaction exists. This indicates a bug in the strategy implementation.`,
      )
    }

    if (activeTransaction.state !== `pending`) {
      throw new Error(
        `Strategy callback called but active transaction is in state "${activeTransaction.state}". Expected "pending".`,
      )
    }

    const txToCommit = activeTransaction

    // Clear active transaction reference before committing
    activeTransaction = null

    // Commit the transaction
    txToCommit.commit().catch(() => {
      // Errors are handled via transaction.isPersisted.promise
      // This catch prevents unhandled promise rejections
    })

    return txToCommit
  }

  /**
   * Executes a mutation with the given variables. Creates a new transaction if none is active,
   * or adds to the existing active transaction. The strategy controls when
   * the transaction is actually committed.
   */
  function mutate(variables: TVariables): Transaction<T> {
    // Create a new transaction if we don't have an active one
    if (!activeTransaction || activeTransaction.state !== `pending`) {
      activeTransaction = createTransaction<T>({
        ...transactionConfig,
        mutationFn,
        autoCommit: false,
      })
    }

    // Execute onMutate with variables to apply optimistic updates
    activeTransaction.mutate(() => {
      onMutate(variables)
    })

    // Save reference before calling strategy.execute
    const txToReturn = activeTransaction

    // For queue strategy, pass a function that commits the captured transaction
    // This prevents the error when commitCallback tries to access the cleared activeTransaction
    if (strategy._type === `queue`) {
      const capturedTx = activeTransaction
      activeTransaction = null // Clear so next mutation creates a new transaction
      strategy.execute(() => {
        capturedTx.commit().catch(() => {
          // Errors are handled via transaction.isPersisted.promise
        })
        return capturedTx
      })
    } else {
      // For debounce/throttle, use commitCallback which manages activeTransaction
      strategy.execute(commitCallback)
    }

    return txToReturn
  }

  return mutate
}
