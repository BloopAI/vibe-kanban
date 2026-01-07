import { MutationFn, Transaction } from './types.cjs';
import { Strategy } from './strategies/types.cjs';
/**
 * Configuration for creating a paced mutations manager
 */
export interface PacedMutationsConfig<TVariables = unknown, T extends object = Record<string, unknown>> {
    /**
     * Callback to apply optimistic updates immediately.
     * Receives the variables passed to the mutate function.
     */
    onMutate: (variables: TVariables) => void;
    /**
     * Function to execute the mutation on the server.
     * Receives the transaction parameters containing all merged mutations.
     */
    mutationFn: MutationFn<T>;
    /**
     * Strategy for controlling mutation execution timing
     * Examples: debounceStrategy, queueStrategy, throttleStrategy
     */
    strategy: Strategy;
    /**
     * Custom metadata to associate with transactions
     */
    metadata?: Record<string, unknown>;
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
export declare function createPacedMutations<TVariables = unknown, T extends object = Record<string, unknown>>(config: PacedMutationsConfig<TVariables, T>): (variables: TVariables) => Transaction<T>;
