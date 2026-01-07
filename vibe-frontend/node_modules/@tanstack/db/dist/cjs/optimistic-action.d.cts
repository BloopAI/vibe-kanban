import { CreateOptimisticActionsOptions, Transaction } from './types.cjs';
/**
 * Creates an optimistic action function that applies local optimistic updates immediately
 * before executing the actual mutation on the server.
 *
 * This pattern allows for responsive UI updates while the actual mutation is in progress.
 * The optimistic update is applied via the `onMutate` callback, and the server mutation
 * is executed via the `mutationFn`.
 *
 * **Important:** Inside your `mutationFn`, you must ensure that your server writes have synced back
 * before you return, as the optimistic state is dropped when you return from the mutation function.
 * You generally use collection-specific helpers to do this, such as Query's `utils.refetch()`,
 * direct write APIs, or Electric's `utils.awaitTxId()`.
 *
 * @example
 * ```ts
 * const addTodo = createOptimisticAction<string>({
 *   onMutate: (text) => {
 *     // Instantly applies local optimistic state
 *     todoCollection.insert({
 *       id: uuid(),
 *       text,
 *       completed: false
 *     })
 *   },
 *   mutationFn: async (text, params) => {
 *     // Persist the todo to your backend
 *     const response = await fetch('/api/todos', {
 *       method: 'POST',
 *       body: JSON.stringify({ text, completed: false }),
 *     })
 *     const result = await response.json()
 *
 *     // IMPORTANT: Ensure server writes have synced back before returning
 *     // This ensures the optimistic state can be safely discarded
 *     await todoCollection.utils.refetch()
 *
 *     return result
 *   }
 * })
 *
 * // Usage
 * const transaction = addTodo('New Todo Item')
 * ```
 *
 * @template TVariables - The type of variables that will be passed to the action function
 * @param options - Configuration options for the optimistic action
 * @returns A function that accepts variables of type TVariables and returns a Transaction
 */
export declare function createOptimisticAction<TVariables = unknown>(options: CreateOptimisticActionsOptions<TVariables>): (variables: TVariables) => Transaction;
