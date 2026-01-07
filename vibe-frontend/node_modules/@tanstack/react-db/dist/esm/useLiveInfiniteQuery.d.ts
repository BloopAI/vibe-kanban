import { useLiveQuery } from './useLiveQuery.js';
import { Collection, Context, InferResultType, InitialQueryBuilder, NonSingleResult, QueryBuilder } from '@tanstack/db';
export type UseLiveInfiniteQueryConfig<TContext extends Context> = {
    pageSize?: number;
    initialPageParam?: number;
    getNextPageParam: (lastPage: Array<InferResultType<TContext>[number]>, allPages: Array<Array<InferResultType<TContext>[number]>>, lastPageParam: number, allPageParams: Array<number>) => number | undefined;
};
export type UseLiveInfiniteQueryReturn<TContext extends Context> = Omit<ReturnType<typeof useLiveQuery<TContext>>, `data`> & {
    data: InferResultType<TContext>;
    pages: Array<Array<InferResultType<TContext>[number]>>;
    pageParams: Array<number>;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
};
/**
 * Create an infinite query using a query function with live updates
 *
 * Uses `utils.setWindow()` to dynamically adjust the limit/offset window
 * without recreating the live query collection on each page change.
 *
 * @param queryFn - Query function that defines what data to fetch. Must include `.orderBy()` for setWindow to work.
 * @param config - Configuration including pageSize and getNextPageParam
 * @param deps - Array of dependencies that trigger query re-execution when changed
 * @returns Object with pages, data, and pagination controls
 *
 * @example
 * // Basic infinite query
 * const { data, pages, fetchNextPage, hasNextPage } = useLiveInfiniteQuery(
 *   (q) => q
 *     .from({ posts: postsCollection })
 *     .orderBy(({ posts }) => posts.createdAt, 'desc')
 *     .select(({ posts }) => ({
 *       id: posts.id,
 *       title: posts.title
 *     })),
 *   {
 *     pageSize: 20,
 *     getNextPageParam: (lastPage, allPages) =>
 *       lastPage.length === 20 ? allPages.length : undefined
 *   }
 * )
 *
 * @example
 * // With dependencies
 * const { pages, fetchNextPage } = useLiveInfiniteQuery(
 *   (q) => q
 *     .from({ posts: postsCollection })
 *     .where(({ posts }) => eq(posts.category, category))
 *     .orderBy(({ posts }) => posts.createdAt, 'desc'),
 *   {
 *     pageSize: 10,
 *     getNextPageParam: (lastPage) =>
 *       lastPage.length === 10 ? lastPage.length : undefined
 *   },
 *   [category]
 * )
 *
 * @example
 * // Router loader pattern with pre-created collection
 * // In loader:
 * const postsQuery = createLiveQueryCollection({
 *   query: (q) => q
 *     .from({ posts: postsCollection })
 *     .orderBy(({ posts }) => posts.createdAt, 'desc')
 *     .limit(20)
 * })
 * await postsQuery.preload()
 * return { postsQuery }
 *
 * // In component:
 * const { postsQuery } = useLoaderData()
 * const { data, fetchNextPage, hasNextPage } = useLiveInfiniteQuery(
 *   postsQuery,
 *   {
 *     pageSize: 20,
 *     getNextPageParam: (lastPage) => lastPage.length === 20 ? lastPage.length : undefined
 *   }
 * )
 */
export declare function useLiveInfiniteQuery<TResult extends object, TKey extends string | number, TUtils extends Record<string, any>>(liveQueryCollection: Collection<TResult, TKey, TUtils> & NonSingleResult, config: UseLiveInfiniteQueryConfig<any>): UseLiveInfiniteQueryReturn<any>;
export declare function useLiveInfiniteQuery<TContext extends Context>(queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>, config: UseLiveInfiniteQueryConfig<TContext>, deps?: Array<unknown>): UseLiveInfiniteQueryReturn<TContext>;
