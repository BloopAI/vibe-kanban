import { Collection, Context, GetResult, InferResultType, InitialQueryBuilder, LiveQueryCollectionConfig, NonSingleResult, QueryBuilder, SingleResult } from '@tanstack/db';
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
export declare function useLiveSuspenseQuery<TContext extends Context>(queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>, deps?: Array<unknown>): {
    state: Map<string | number, GetResult<TContext>>;
    data: InferResultType<TContext>;
    collection: Collection<GetResult<TContext>, string | number, {}>;
};
export declare function useLiveSuspenseQuery<TContext extends Context>(config: LiveQueryCollectionConfig<TContext>, deps?: Array<unknown>): {
    state: Map<string | number, GetResult<TContext>>;
    data: InferResultType<TContext>;
    collection: Collection<GetResult<TContext>, string | number, {}>;
};
export declare function useLiveSuspenseQuery<TResult extends object, TKey extends string | number, TUtils extends Record<string, any>>(liveQueryCollection: Collection<TResult, TKey, TUtils> & NonSingleResult): {
    state: Map<TKey, TResult>;
    data: Array<TResult>;
    collection: Collection<TResult, TKey, TUtils>;
};
export declare function useLiveSuspenseQuery<TResult extends object, TKey extends string | number, TUtils extends Record<string, any>>(liveQueryCollection: Collection<TResult, TKey, TUtils> & SingleResult): {
    state: Map<TKey, TResult>;
    data: TResult | undefined;
    collection: Collection<TResult, TKey, TUtils> & SingleResult;
};
