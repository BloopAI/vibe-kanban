import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CollectionImpl } from '@tanstack/db'
import { useLiveQuery } from './useLiveQuery'
import type {
  Collection,
  Context,
  InferResultType,
  InitialQueryBuilder,
  LiveQueryCollectionUtils,
  NonSingleResult,
  QueryBuilder,
} from '@tanstack/db'

/**
 * Type guard to check if utils object has setWindow method (LiveQueryCollectionUtils)
 */
function isLiveQueryCollectionUtils(
  utils: unknown,
): utils is LiveQueryCollectionUtils {
  return typeof (utils as any).setWindow === `function`
}

export type UseLiveInfiniteQueryConfig<TContext extends Context> = {
  pageSize?: number
  initialPageParam?: number
  getNextPageParam: (
    lastPage: Array<InferResultType<TContext>[number]>,
    allPages: Array<Array<InferResultType<TContext>[number]>>,
    lastPageParam: number,
    allPageParams: Array<number>,
  ) => number | undefined
}

export type UseLiveInfiniteQueryReturn<TContext extends Context> = Omit<
  ReturnType<typeof useLiveQuery<TContext>>,
  `data`
> & {
  data: InferResultType<TContext>
  pages: Array<Array<InferResultType<TContext>[number]>>
  pageParams: Array<number>
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
}

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

// Overload for pre-created collection (non-single result)
export function useLiveInfiniteQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends Record<string, any>,
>(
  liveQueryCollection: Collection<TResult, TKey, TUtils> & NonSingleResult,
  config: UseLiveInfiniteQueryConfig<any>,
): UseLiveInfiniteQueryReturn<any>

// Overload for query function
export function useLiveInfiniteQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  config: UseLiveInfiniteQueryConfig<TContext>,
  deps?: Array<unknown>,
): UseLiveInfiniteQueryReturn<TContext>

// Implementation
export function useLiveInfiniteQuery<TContext extends Context>(
  queryFnOrCollection: any,
  config: UseLiveInfiniteQueryConfig<TContext>,
  deps: Array<unknown> = [],
): UseLiveInfiniteQueryReturn<TContext> {
  const pageSize = config.pageSize || 20
  const initialPageParam = config.initialPageParam ?? 0

  // Detect if input is a collection or query function
  const isCollection = queryFnOrCollection instanceof CollectionImpl

  // Validate input type
  if (!isCollection && typeof queryFnOrCollection !== `function`) {
    throw new Error(
      `useLiveInfiniteQuery: First argument must be either a pre-created live query collection (CollectionImpl) ` +
        `or a query function. Received: ${typeof queryFnOrCollection}`,
    )
  }

  // Track how many pages have been loaded
  const [loadedPageCount, setLoadedPageCount] = useState(1)
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false)

  // Track collection instance and whether we've validated it (only for pre-created collections)
  const collectionRef = useRef(isCollection ? queryFnOrCollection : null)
  const hasValidatedCollectionRef = useRef(false)

  // Track deps for query functions (stringify for comparison)
  const depsKey = JSON.stringify(deps)
  const prevDepsKeyRef = useRef(depsKey)

  // Reset pagination when inputs change
  useEffect(() => {
    let shouldReset = false

    if (isCollection) {
      // Reset if collection instance changed
      if (collectionRef.current !== queryFnOrCollection) {
        collectionRef.current = queryFnOrCollection
        hasValidatedCollectionRef.current = false
        shouldReset = true
      }
    } else {
      // Reset if deps changed (for query functions)
      if (prevDepsKeyRef.current !== depsKey) {
        prevDepsKeyRef.current = depsKey
        shouldReset = true
      }
    }

    if (shouldReset) {
      setLoadedPageCount(1)
    }
  }, [isCollection, queryFnOrCollection, depsKey])

  // Create a live query with initial limit and offset
  // Either pass collection directly or wrap query function
  const queryResult = isCollection
    ? useLiveQuery(queryFnOrCollection)
    : useLiveQuery(
        (q) => queryFnOrCollection(q).limit(pageSize).offset(0),
        deps,
      )

  // Adjust window when pagination changes
  useEffect(() => {
    const utils = queryResult.collection.utils
    const expectedOffset = 0
    const expectedLimit = loadedPageCount * pageSize + 1 // +1 for peek ahead

    // Check if collection has orderBy (required for setWindow)
    if (!isLiveQueryCollectionUtils(utils)) {
      // For pre-created collections, throw an error if no orderBy
      if (isCollection) {
        throw new Error(
          `useLiveInfiniteQuery: Pre-created live query collection must have an orderBy clause for infinite pagination to work. ` +
            `Please add .orderBy() to your createLiveQueryCollection query.`,
        )
      }
      return
    }

    // For pre-created collections, validate window on first check
    if (isCollection && !hasValidatedCollectionRef.current) {
      const currentWindow = utils.getWindow()
      if (
        currentWindow &&
        (currentWindow.offset !== expectedOffset ||
          currentWindow.limit !== expectedLimit)
      ) {
        console.warn(
          `useLiveInfiniteQuery: Pre-created collection has window {offset: ${currentWindow.offset}, limit: ${currentWindow.limit}} ` +
            `but hook expects {offset: ${expectedOffset}, limit: ${expectedLimit}}. Adjusting window now.`,
        )
      }
      hasValidatedCollectionRef.current = true
    }

    // For query functions, wait until collection is ready
    if (!isCollection && !queryResult.isReady) return

    // Adjust the window
    const result = utils.setWindow({
      offset: expectedOffset,
      limit: expectedLimit,
    })

    if (result !== true) {
      setIsFetchingNextPage(true)
      result.then(() => {
        setIsFetchingNextPage(false)
      })
    } else {
      setIsFetchingNextPage(false)
    }
  }, [
    isCollection,
    queryResult.collection,
    queryResult.isReady,
    loadedPageCount,
    pageSize,
  ])

  // Split the data array into pages and determine if there's a next page
  const { pages, pageParams, hasNextPage, flatData } = useMemo(() => {
    const dataArray = (
      Array.isArray(queryResult.data) ? queryResult.data : []
    ) as InferResultType<TContext>
    const totalItemsRequested = loadedPageCount * pageSize

    // Check if we have more data than requested (the peek ahead item)
    const hasMore = dataArray.length > totalItemsRequested

    // Build pages array (without the peek ahead item)
    const pagesResult: Array<Array<InferResultType<TContext>[number]>> = []
    const pageParamsResult: Array<number> = []

    for (let i = 0; i < loadedPageCount; i++) {
      const pageData = dataArray.slice(i * pageSize, (i + 1) * pageSize)
      pagesResult.push(pageData)
      pageParamsResult.push(initialPageParam + i)
    }

    // Flatten the pages for the data return (without peek ahead item)
    const flatDataResult = dataArray.slice(
      0,
      totalItemsRequested,
    ) as InferResultType<TContext>

    return {
      pages: pagesResult,
      pageParams: pageParamsResult,
      hasNextPage: hasMore,
      flatData: flatDataResult,
    }
  }, [queryResult.data, loadedPageCount, pageSize, initialPageParam])

  // Fetch next page
  const fetchNextPage = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return

    setLoadedPageCount((prev) => prev + 1)
  }, [hasNextPage, isFetchingNextPage])

  return {
    ...queryResult,
    data: flatData,
    pages,
    pageParams,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } as UseLiveInfiniteQueryReturn<TContext>
}
