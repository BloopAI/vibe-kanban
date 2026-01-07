import { Deferred } from './deferred.js';
import { MutationFn, PendingMutation, TransactionConfig, TransactionState } from './types.js';
/**
 * Creates a new transaction for grouping multiple collection operations
 * @param config - Transaction configuration with mutation function
 * @returns A new Transaction instance
 * @example
 * // Basic transaction usage
 * const tx = createTransaction({
 *   mutationFn: async ({ transaction }) => {
 *     // Send all mutations to API
 *     await api.saveChanges(transaction.mutations)
 *   }
 * })
 *
 * tx.mutate(() => {
 *   collection.insert({ id: "1", text: "Buy milk" })
 *   collection.update("2", draft => { draft.completed = true })
 * })
 *
 * await tx.isPersisted.promise
 *
 * @example
 * // Handle transaction errors
 * try {
 *   const tx = createTransaction({
 *     mutationFn: async () => { throw new Error("API failed") }
 *   })
 *
 *   tx.mutate(() => {
 *     collection.insert({ id: "1", text: "New item" })
 *   })
 *
 *   await tx.isPersisted.promise
 * } catch (error) {
 *   console.log('Transaction failed:', error)
 * }
 *
 * @example
 * // Manual commit control
 * const tx = createTransaction({
 *   autoCommit: false,
 *   mutationFn: async () => {
 *     // API call
 *   }
 * })
 *
 * tx.mutate(() => {
 *   collection.insert({ id: "1", text: "Item" })
 * })
 *
 * // Commit later
 * await tx.commit()
 */
export declare function createTransaction<T extends object = Record<string, unknown>>(config: TransactionConfig<T>): Transaction<T>;
/**
 * Gets the currently active ambient transaction, if any
 * Used internally by collection operations to join existing transactions
 * @returns The active transaction or undefined if none is active
 * @example
 * // Check if operations will join an ambient transaction
 * const ambientTx = getActiveTransaction()
 * if (ambientTx) {
 *   console.log('Operations will join transaction:', ambientTx.id)
 * }
 */
export declare function getActiveTransaction(): Transaction | undefined;
declare class Transaction<T extends object = Record<string, unknown>> {
    id: string;
    state: TransactionState;
    mutationFn: MutationFn<T>;
    mutations: Array<PendingMutation<T>>;
    isPersisted: Deferred<Transaction<T>>;
    autoCommit: boolean;
    createdAt: Date;
    sequenceNumber: number;
    metadata: Record<string, unknown>;
    error?: {
        message: string;
        error: Error;
    };
    constructor(config: TransactionConfig<T>);
    setState(newState: TransactionState): void;
    /**
     * Execute collection operations within this transaction
     * @param callback - Function containing collection operations to group together. If the
     * callback returns a Promise, the transaction context will remain active until the promise
     * settles, allowing optimistic writes after `await` boundaries.
     * @returns This transaction for chaining
     * @example
     * // Group multiple operations
     * const tx = createTransaction({ mutationFn: async () => {
     *   // Send to API
     * }})
     *
     * tx.mutate(() => {
     *   collection.insert({ id: "1", text: "Buy milk" })
     *   collection.update("2", draft => { draft.completed = true })
     *   collection.delete("3")
     * })
     *
     * await tx.isPersisted.promise
     *
     * @example
     * // Handle mutate errors
     * try {
     *   tx.mutate(() => {
     *     collection.insert({ id: "invalid" }) // This might throw
     *   })
     * } catch (error) {
     *   console.log('Mutation failed:', error)
     * }
     *
     * @example
     * // Manual commit control
     * const tx = createTransaction({ autoCommit: false, mutationFn: async () => {} })
     *
     * tx.mutate(() => {
     *   collection.insert({ id: "1", text: "Item" })
     * })
     *
     * // Commit later when ready
     * await tx.commit()
     */
    mutate(callback: () => void): Transaction<T>;
    /**
     * Apply new mutations to this transaction, intelligently merging with existing mutations
     *
     * When mutations operate on the same item (same globalKey), they are merged according to
     * the following rules:
     *
     * - **insert + update** → insert (merge changes, keep empty original)
     * - **insert + delete** → removed (mutations cancel each other out)
     * - **update + delete** → delete (delete dominates)
     * - **update + update** → update (union changes, keep first original)
     * - **same type** → replace with latest
     *
     * This merging reduces over-the-wire churn and keeps the optimistic local view
     * aligned with user intent.
     *
     * @param mutations - Array of new mutations to apply
     */
    applyMutations(mutations: Array<PendingMutation<any>>): void;
    /**
     * Rollback the transaction and any conflicting transactions
     * @param config - Configuration for rollback behavior
     * @returns This transaction for chaining
     * @example
     * // Manual rollback
     * const tx = createTransaction({ mutationFn: async () => {
     *   // Send to API
     * }})
     *
     * tx.mutate(() => {
     *   collection.insert({ id: "1", text: "Buy milk" })
     * })
     *
     * // Rollback if needed
     * if (shouldCancel) {
     *   tx.rollback()
     * }
     *
     * @example
     * // Handle rollback cascade (automatic)
     * const tx1 = createTransaction({ mutationFn: async () => {} })
     * const tx2 = createTransaction({ mutationFn: async () => {} })
     *
     * tx1.mutate(() => collection.update("1", draft => { draft.value = "A" }))
     * tx2.mutate(() => collection.update("1", draft => { draft.value = "B" })) // Same item
     *
     * tx1.rollback() // This will also rollback tx2 due to conflict
     *
     * @example
     * // Handle rollback in error scenarios
     * try {
     *   await tx.isPersisted.promise
     * } catch (error) {
     *   console.log('Transaction was rolled back:', error)
     *   // Transaction automatically rolled back on mutation function failure
     * }
     */
    rollback(config?: {
        isSecondaryRollback?: boolean;
    }): Transaction<T>;
    touchCollection(): void;
    /**
     * Commit the transaction and execute the mutation function
     * @returns Promise that resolves to this transaction when complete
     * @example
     * // Manual commit (when autoCommit is false)
     * const tx = createTransaction({
     *   autoCommit: false,
     *   mutationFn: async ({ transaction }) => {
     *     await api.saveChanges(transaction.mutations)
     *   }
     * })
     *
     * tx.mutate(() => {
     *   collection.insert({ id: "1", text: "Buy milk" })
     * })
     *
     * await tx.commit() // Manually commit
     *
     * @example
     * // Handle commit errors
     * try {
     *   const tx = createTransaction({
     *     mutationFn: async () => { throw new Error("API failed") }
     *   })
     *
     *   tx.mutate(() => {
     *     collection.insert({ id: "1", text: "Item" })
     *   })
     *
     *   await tx.commit()
     * } catch (error) {
     *   console.log('Commit failed, transaction rolled back:', error)
     * }
     *
     * @example
     * // Check transaction state after commit
     * await tx.commit()
     * console.log(tx.state) // "completed" or "failed"
     */
    commit(): Promise<Transaction<T>>;
    /**
     * Compare two transactions by their createdAt time and sequence number in order
     * to sort them in the order they were created.
     * @param other - The other transaction to compare to
     * @returns -1 if this transaction was created before the other, 1 if it was created after, 0 if they were created at the same time
     */
    compareCreatedAt(other: Transaction<any>): number;
}
export type { Transaction };
