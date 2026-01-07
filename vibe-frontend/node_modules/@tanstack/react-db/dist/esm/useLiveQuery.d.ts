import { Collection, CollectionStatus, Context, GetResult, InferResultType, InitialQueryBuilder, LiveQueryCollectionConfig, NonSingleResult, QueryBuilder, SingleResult } from '@tanstack/db';
export type UseLiveQueryStatus = CollectionStatus | `disabled`;
/**
 * Create a live query using a query function
 * @param queryFn - Query function that defines what data to fetch
 * @param deps - Array of dependencies that trigger query re-execution when changed
 * @returns Object with reactive data, state, and status information
 * @example
 * // Basic query with object syntax
 * const { data, isLoading } = useLiveQuery((q) =>
 *   q.from({ todos: todosCollection })
 *    .where(({ todos }) => eq(todos.completed, false))
 *    .select(({ todos }) => ({ id: todos.id, text: todos.text }))
 * )
 *
 *  @example
 * // Single result query
 * const { data } = useLiveQuery(
 *   (q) => q.from({ todos: todosCollection })
 *          .where(({ todos }) => eq(todos.id, 1))
 *          .findOne()
 * )
 *
 * @example
 * // With dependencies that trigger re-execution
 * const { data, state } = useLiveQuery(
 *   (q) => q.from({ todos: todosCollection })
 *          .where(({ todos }) => gt(todos.priority, minPriority)),
 *   [minPriority] // Re-run when minPriority changes
 * )
 *
 * @example
 * // Join pattern
 * const { data } = useLiveQuery((q) =>
 *   q.from({ issues: issueCollection })
 *    .join({ persons: personCollection }, ({ issues, persons }) =>
 *      eq(issues.userId, persons.id)
 *    )
 *    .select(({ issues, persons }) => ({
 *      id: issues.id,
 *      title: issues.title,
 *      userName: persons.name
 *    }))
 * )
 *
 * @example
 * // Handle loading and error states
 * const { data, isLoading, isError, status } = useLiveQuery((q) =>
 *   q.from({ todos: todoCollection })
 * )
 *
 * if (isLoading) return <div>Loading...</div>
 * if (isError) return <div>Error: {status}</div>
 *
 * return (
 *   <ul>
 *     {data.map(todo => <li key={todo.id}>{todo.text}</li>)}
 *   </ul>
 * )
 */
export declare function useLiveQuery<TContext extends Context>(queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>, deps?: Array<unknown>): {
    state: Map<string | number, GetResult<TContext>>;
    data: InferResultType<TContext>;
    collection: Collection<GetResult<TContext>, string | number, {}>;
    status: CollectionStatus;
    isLoading: boolean;
    isReady: boolean;
    isIdle: boolean;
    isError: boolean;
    isCleanedUp: boolean;
    isEnabled: true;
};
export declare function useLiveQuery<TContext extends Context>(queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext> | undefined | null, deps?: Array<unknown>): {
    state: Map<string | number, GetResult<TContext>> | undefined;
    data: InferResultType<TContext> | undefined;
    collection: Collection<GetResult<TContext>, string | number, {}> | undefined;
    status: UseLiveQueryStatus;
    isLoading: boolean;
    isReady: boolean;
    isIdle: boolean;
    isError: boolean;
    isCleanedUp: boolean;
    isEnabled: boolean;
};
export declare function useLiveQuery<TContext extends Context>(queryFn: (q: InitialQueryBuilder) => LiveQueryCollectionConfig<TContext> | undefined | null, deps?: Array<unknown>): {
    state: Map<string | number, GetResult<TContext>> | undefined;
    data: InferResultType<TContext> | undefined;
    collection: Collection<GetResult<TContext>, string | number, {}> | undefined;
    status: UseLiveQueryStatus;
    isLoading: boolean;
    isReady: boolean;
    isIdle: boolean;
    isError: boolean;
    isCleanedUp: boolean;
    isEnabled: boolean;
};
export declare function useLiveQuery<TResult extends object, TKey extends string | number, TUtils extends Record<string, any>>(queryFn: (q: InitialQueryBuilder) => Collection<TResult, TKey, TUtils> | undefined | null, deps?: Array<unknown>): {
    state: Map<TKey, TResult> | undefined;
    data: Array<TResult> | undefined;
    collection: Collection<TResult, TKey, TUtils> | undefined;
    status: UseLiveQueryStatus;
    isLoading: boolean;
    isReady: boolean;
    isIdle: boolean;
    isError: boolean;
    isCleanedUp: boolean;
    isEnabled: boolean;
};
export declare function useLiveQuery<TContext extends Context, TResult extends object, TKey extends string | number, TUtils extends Record<string, any>>(queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext> | LiveQueryCollectionConfig<TContext> | Collection<TResult, TKey, TUtils> | undefined | null, deps?: Array<unknown>): {
    state: Map<string | number, GetResult<TContext>> | Map<TKey, TResult> | undefined;
    data: InferResultType<TContext> | Array<TResult> | undefined;
    collection: Collection<GetResult<TContext>, string | number, {}> | Collection<TResult, TKey, TUtils> | undefined;
    status: UseLiveQueryStatus;
    isLoading: boolean;
    isReady: boolean;
    isIdle: boolean;
    isError: boolean;
    isCleanedUp: boolean;
    isEnabled: boolean;
};
/**
 * Create a live query using configuration object
 * @param config - Configuration object with query and options
 * @param deps - Array of dependencies that trigger query re-execution when changed
 * @returns Object with reactive data, state, and status information
 * @example
 * // Basic config object usage
 * const { data, status } = useLiveQuery({
 *   query: (q) => q.from({ todos: todosCollection }),
 *   gcTime: 60000
 * })
 *
 * @example
 * // With query builder and options
 * const queryBuilder = new Query()
 *   .from({ persons: collection })
 *   .where(({ persons }) => gt(persons.age, 30))
 *   .select(({ persons }) => ({ id: persons.id, name: persons.name }))
 *
 * const { data, isReady } = useLiveQuery({ query: queryBuilder })
 *
 * @example
 * // Handle all states uniformly
 * const { data, isLoading, isReady, isError } = useLiveQuery({
 *   query: (q) => q.from({ items: itemCollection })
 * })
 *
 * if (isLoading) return <div>Loading...</div>
 * if (isError) return <div>Something went wrong</div>
 * if (!isReady) return <div>Preparing...</div>
 *
 * return <div>{data.length} items loaded</div>
 */
export declare function useLiveQuery<TContext extends Context>(config: LiveQueryCollectionConfig<TContext>, deps?: Array<unknown>): {
    state: Map<string | number, GetResult<TContext>>;
    data: InferResultType<TContext>;
    collection: Collection<GetResult<TContext>, string | number, {}>;
    status: CollectionStatus;
    isLoading: boolean;
    isReady: boolean;
    isIdle: boolean;
    isError: boolean;
    isCleanedUp: boolean;
    isEnabled: true;
};
/**
 * Subscribe to an existing live query collection
 * @param liveQueryCollection - Pre-created live query collection to subscribe to
 * @returns Object with reactive data, state, and status information
 * @example
 * // Using pre-created live query collection
 * const myLiveQuery = createLiveQueryCollection((q) =>
 *   q.from({ todos: todosCollection }).where(({ todos }) => eq(todos.active, true))
 * )
 * const { data, collection } = useLiveQuery(myLiveQuery)
 *
 * @example
 * // Access collection methods directly
 * const { data, collection, isReady } = useLiveQuery(existingCollection)
 *
 * // Use collection for mutations
 * const handleToggle = (id) => {
 *   collection.update(id, draft => { draft.completed = !draft.completed })
 * }
 *
 * @example
 * // Handle states consistently
 * const { data, isLoading, isError } = useLiveQuery(sharedCollection)
 *
 * if (isLoading) return <div>Loading...</div>
 * if (isError) return <div>Error loading data</div>
 *
 * return <div>{data.map(item => <Item key={item.id} {...item} />)}</div>
 */
export declare function useLiveQuery<TResult extends object, TKey extends string | number, TUtils extends Record<string, any>>(liveQueryCollection: Collection<TResult, TKey, TUtils> & NonSingleResult): {
    state: Map<TKey, TResult>;
    data: Array<TResult>;
    collection: Collection<TResult, TKey, TUtils>;
    status: CollectionStatus;
    isLoading: boolean;
    isReady: boolean;
    isIdle: boolean;
    isError: boolean;
    isCleanedUp: boolean;
    isEnabled: true;
};
export declare function useLiveQuery<TResult extends object, TKey extends string | number, TUtils extends Record<string, any>>(liveQueryCollection: Collection<TResult, TKey, TUtils> & SingleResult): {
    state: Map<TKey, TResult>;
    data: TResult | undefined;
    collection: Collection<TResult, TKey, TUtils> & SingleResult;
    status: CollectionStatus;
    isLoading: boolean;
    isReady: boolean;
    isIdle: boolean;
    isError: boolean;
    isCleanedUp: boolean;
    isEnabled: true;
};
