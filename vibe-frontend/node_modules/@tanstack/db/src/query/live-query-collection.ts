import { createCollection } from '../collection/index.js'
import { CollectionConfigBuilder } from './live/collection-config-builder.js'
import {
  getBuilderFromConfig,
  registerCollectionBuilder,
} from './live/collection-registry.js'
import type { LiveQueryCollectionUtils } from './live/collection-config-builder.js'
import type { LiveQueryCollectionConfig } from './live/types.js'
import type { InitialQueryBuilder, QueryBuilder } from './builder/index.js'
import type { Collection } from '../collection/index.js'
import type {
  CollectionConfig,
  CollectionConfigSingleRowOption,
  NonSingleResult,
  SingleResult,
  UtilsRecord,
} from '../types.js'
import type { Context, GetResult } from './builder/types.js'

type CollectionConfigForContext<
  TContext extends Context,
  TResult extends object,
  TUtils extends UtilsRecord = {},
> = TContext extends SingleResult
  ? CollectionConfigSingleRowOption<TResult, string | number, never, TUtils> &
      SingleResult
  : CollectionConfigSingleRowOption<TResult, string | number, never, TUtils> &
      NonSingleResult

type CollectionForContext<
  TContext extends Context,
  TResult extends object,
  TUtils extends UtilsRecord = {},
> = TContext extends SingleResult
  ? Collection<TResult, string | number, TUtils> & SingleResult
  : Collection<TResult, string | number, TUtils> & NonSingleResult

/**
 * Creates live query collection options for use with createCollection
 *
 * @example
 * ```typescript
 * const options = liveQueryCollectionOptions({
 *   // id is optional - will auto-generate if not provided
 *   query: (q) => q
 *     .from({ post: postsCollection })
 *     .where(({ post }) => eq(post.published, true))
 *     .select(({ post }) => ({
 *       id: post.id,
 *       title: post.title,
 *       content: post.content,
 *     })),
 *   // getKey is optional - will use stream key if not provided
 * })
 *
 * const collection = createCollection(options)
 * ```
 *
 * @param config - Configuration options for the live query collection
 * @returns Collection options that can be passed to createCollection
 */
export function liveQueryCollectionOptions<
  TContext extends Context,
  TResult extends object = GetResult<TContext>,
>(
  config: LiveQueryCollectionConfig<TContext, TResult>,
): CollectionConfigForContext<TContext, TResult> & {
  utils: LiveQueryCollectionUtils
} {
  const collectionConfigBuilder = new CollectionConfigBuilder<
    TContext,
    TResult
  >(config)
  return collectionConfigBuilder.getConfig() as CollectionConfigForContext<
    TContext,
    TResult
  > & { utils: LiveQueryCollectionUtils }
}

/**
 * Creates a live query collection directly
 *
 * @example
 * ```typescript
 * // Minimal usage - just pass a query function
 * const activeUsers = createLiveQueryCollection(
 *   (q) => q
 *     .from({ user: usersCollection })
 *     .where(({ user }) => eq(user.active, true))
 *     .select(({ user }) => ({ id: user.id, name: user.name }))
 * )
 *
 * // Full configuration with custom options
 * const searchResults = createLiveQueryCollection({
 *   id: "search-results", // Custom ID (auto-generated if omitted)
 *   query: (q) => q
 *     .from({ post: postsCollection })
 *     .where(({ post }) => like(post.title, `%${searchTerm}%`))
 *     .select(({ post }) => ({
 *       id: post.id,
 *       title: post.title,
 *       excerpt: post.excerpt,
 *     })),
 *   getKey: (item) => item.id, // Custom key function (uses stream key if omitted)
 *   utils: {
 *     updateSearchTerm: (newTerm: string) => {
 *       // Custom utility functions
 *     }
 *   }
 * })
 * ```
 */

// Overload 1: Accept just the query function
export function createLiveQueryCollection<
  TContext extends Context,
  TResult extends object = GetResult<TContext>,
>(
  query: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
): CollectionForContext<TContext, TResult> & {
  utils: LiveQueryCollectionUtils
}

// Overload 2: Accept full config object with optional utilities
export function createLiveQueryCollection<
  TContext extends Context,
  TResult extends object = GetResult<TContext>,
  TUtils extends UtilsRecord = {},
>(
  config: LiveQueryCollectionConfig<TContext, TResult> & { utils?: TUtils },
): CollectionForContext<TContext, TResult> & {
  utils: LiveQueryCollectionUtils & TUtils
}

// Implementation
export function createLiveQueryCollection<
  TContext extends Context,
  TResult extends object = GetResult<TContext>,
  TUtils extends UtilsRecord = {},
>(
  configOrQuery:
    | (LiveQueryCollectionConfig<TContext, TResult> & { utils?: TUtils })
    | ((q: InitialQueryBuilder) => QueryBuilder<TContext>),
): CollectionForContext<TContext, TResult> & {
  utils: LiveQueryCollectionUtils & TUtils
} {
  // Determine if the argument is a function (query) or a config object
  if (typeof configOrQuery === `function`) {
    // Simple query function case
    const config: LiveQueryCollectionConfig<TContext, TResult> = {
      query: configOrQuery as (
        q: InitialQueryBuilder,
      ) => QueryBuilder<TContext>,
    }
    const options = liveQueryCollectionOptions<TContext, TResult>(config)
    return bridgeToCreateCollection(options) as CollectionForContext<
      TContext,
      TResult
    > & { utils: LiveQueryCollectionUtils & TUtils }
  } else {
    // Config object case
    const config = configOrQuery as LiveQueryCollectionConfig<
      TContext,
      TResult
    > & { utils?: TUtils }
    const options = liveQueryCollectionOptions<TContext, TResult>(config)

    // Merge custom utils if provided, preserving the getBuilder() method for dependency tracking
    if (config.utils) {
      options.utils = { ...options.utils, ...config.utils }
    }

    return bridgeToCreateCollection(options) as CollectionForContext<
      TContext,
      TResult
    > & { utils: LiveQueryCollectionUtils & TUtils }
  }
}

/**
 * Bridge function that handles the type compatibility between query2's TResult
 * and core collection's output type without exposing ugly type assertions to users
 */
function bridgeToCreateCollection<
  TResult extends object,
  TUtils extends UtilsRecord = {},
>(
  options: CollectionConfig<TResult> & { utils: TUtils },
): Collection<TResult, string | number, TUtils> {
  const collection = createCollection(options as any) as unknown as Collection<
    TResult,
    string | number,
    LiveQueryCollectionUtils
  >

  const builder = getBuilderFromConfig(options)
  if (builder) {
    registerCollectionBuilder(collection, builder)
  }

  return collection as unknown as Collection<TResult, string | number, TUtils>
}
