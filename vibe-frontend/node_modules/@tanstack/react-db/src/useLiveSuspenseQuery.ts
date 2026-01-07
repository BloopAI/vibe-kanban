import { useRef } from 'react'
import { useLiveQuery } from './useLiveQuery'
import type {
  Collection,
  Context,
  GetResult,
  InferResultType,
  InitialQueryBuilder,
  LiveQueryCollectionConfig,
  NonSingleResult,
  QueryBuilder,
  SingleResult,
} from '@tanstack/db'

/**
 * Create a live query with React Suspense support
 * @param queryFn - Query function that defines what data to fetch
 * @param deps - Array of dependencies that trigger query re-execution when changed
 * @returns Object with reactive data and state - data is guaranteed to be defined
 * @throws Promise when data is loading (caught by Suspense boundary)
 * @throws Error when collection fails (caught by Error boundary)
 * @example
 * // Basic usage with Suspense
 * function TodoList() {
 *   const { data } = useLiveSuspenseQuery((q) =>
 *     q.from({ todos: todosCollection })
 *      .where(({ todos }) => eq(todos.completed, false))
 *      .select(({ todos }) => ({ id: todos.id, text: todos.text }))
 *   )
 *
 *   return (
 *     <ul>
 *       {data.map(todo => <li key={todo.id}>{todo.text}</li>)}
 *     </ul>
 *   )
 * }
 *
 * function App() {
 *   return (
 *     <Suspense fallback={<div>Loading...</div>}>
 *       <TodoList />
 *     </Suspense>
 *   )
 * }
 *
 * @example
 * // Single result query
 * const { data } = useLiveSuspenseQuery(
 *   (q) => q.from({ todos: todosCollection })
 *          .where(({ todos }) => eq(todos.id, 1))
 *          .findOne()
 * )
 * // data is guaranteed to be the single item (or undefined if not found)
 *
 * @example
 * // With dependencies that trigger re-suspension
 * const { data } = useLiveSuspenseQuery(
 *   (q) => q.from({ todos: todosCollection })
 *          .where(({ todos }) => gt(todos.priority, minPriority)),
 *   [minPriority] // Re-suspends when minPriority changes
 * )
 *
 * @example
 * // With Error boundary
 * function App() {
 *   return (
 *     <ErrorBoundary fallback={<div>Error loading data</div>}>
 *       <Suspense fallback={<div>Loading...</div>}>
 *         <TodoList />
 *       </Suspense>
 *     </ErrorBoundary>
 *   )
 * }
 */
// Overload 1: Accept query function that always returns QueryBuilder
export function useLiveSuspenseQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  deps?: Array<unknown>,
): {
  state: Map<string | number, GetResult<TContext>>
  data: InferResultType<TContext>
  collection: Collection<GetResult<TContext>, string | number, {}>
}

// Overload 2: Accept config object
export function useLiveSuspenseQuery<TContext extends Context>(
  config: LiveQueryCollectionConfig<TContext>,
  deps?: Array<unknown>,
): {
  state: Map<string | number, GetResult<TContext>>
  data: InferResultType<TContext>
  collection: Collection<GetResult<TContext>, string | number, {}>
}

// Overload 3: Accept pre-created live query collection
export function useLiveSuspenseQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends Record<string, any>,
>(
  liveQueryCollection: Collection<TResult, TKey, TUtils> & NonSingleResult,
): {
  state: Map<TKey, TResult>
  data: Array<TResult>
  collection: Collection<TResult, TKey, TUtils>
}

// Overload 4: Accept pre-created live query collection with singleResult: true
export function useLiveSuspenseQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends Record<string, any>,
>(
  liveQueryCollection: Collection<TResult, TKey, TUtils> & SingleResult,
): {
  state: Map<TKey, TResult>
  data: TResult | undefined
  collection: Collection<TResult, TKey, TUtils> & SingleResult
}

// Implementation - uses useLiveQuery internally and adds Suspense logic
export function useLiveSuspenseQuery(
  configOrQueryOrCollection: any,
  deps: Array<unknown> = [],
) {
  const promiseRef = useRef<Promise<void> | null>(null)
  const collectionRef = useRef<Collection<any, any, any> | null>(null)
  const hasBeenReadyRef = useRef(false)

  // Use useLiveQuery to handle collection management and reactivity
  const result = useLiveQuery(configOrQueryOrCollection, deps)

  // Reset promise and ready state when collection changes (deps changed)
  if (collectionRef.current !== result.collection) {
    promiseRef.current = null
    collectionRef.current = result.collection
    hasBeenReadyRef.current = false
  }

  // Track when we reach ready state
  if (result.status === `ready`) {
    hasBeenReadyRef.current = true
    promiseRef.current = null
  }

  // SUSPENSE LOGIC: Throw promise or error based on collection status
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!result.isEnabled) {
    // Suspense queries cannot be disabled - throw error
    throw new Error(
      `useLiveSuspenseQuery does not support disabled queries. Use useLiveQuery instead for conditional queries.`,
    )
  }

  // Only throw errors during initial load (before first ready)
  // After success, errors surface as stale data (matches TanStack Query behavior)
  if (result.status === `error` && !hasBeenReadyRef.current) {
    promiseRef.current = null
    // TODO: Once collections hold a reference to their last error object (#671),
    // we should rethrow that actual error instead of creating a generic message
    throw new Error(`Collection "${result.collection.id}" failed to load`)
  }

  if (result.status === `loading` || result.status === `idle`) {
    // Create or reuse promise for current collection
    if (!promiseRef.current) {
      promiseRef.current = result.collection.preload()
    }
    // THROW PROMISE - React Suspense catches this (React 18+ required)
    // Note: We don't check React version here. In React <18, this will be caught
    // by an Error Boundary, which provides a reasonable failure mode.
    throw promiseRef.current
  }

  // Return data without status/loading flags (handled by Suspense/ErrorBoundary)
  // If error after success, return last known good state (stale data)
  return {
    state: result.state,
    data: result.data,
    collection: result.collection,
  }
}
