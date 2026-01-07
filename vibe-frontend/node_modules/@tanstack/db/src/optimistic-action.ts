import { createTransaction } from './transactions'
import { OnMutateMustBeSynchronousError } from './errors'
import { isPromiseLike } from './utils/type-guards'
import type { CreateOptimisticActionsOptions, Transaction } from './types'

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
export function createOptimisticAction<TVariables = unknown>(
  options: CreateOptimisticActionsOptions<TVariables>,
) {
  const { mutationFn, onMutate, ...config } = options

  return (variables: TVariables): Transaction => {
    // Create transaction with the original config
    const transaction = createTransaction({
      ...config,
      // Wire the mutationFn to use the provided variables
      mutationFn: async (params) => {
        return await mutationFn(variables, params)
      },
    })

    // Execute the transaction. The mutationFn is called once mutate()
    // is finished.
    transaction.mutate(() => {
      const maybePromise = onMutate(variables) as unknown

      if (isPromiseLike(maybePromise)) {
        throw new OnMutateMustBeSynchronousError()
      }
    })

    return transaction
  }
}
