import { LiveQueryCollectionUtils } from './live/collection-config-builder.js';
import { LiveQueryCollectionConfig } from './live/types.js';
import { InitialQueryBuilder, QueryBuilder } from './builder/index.js';
import { Collection } from '../collection/index.js';
import { CollectionConfigSingleRowOption, NonSingleResult, SingleResult, UtilsRecord } from '../types.js';
import { Context, GetResult } from './builder/types.js';
type CollectionConfigForContext<TContext extends Context, TResult extends object, TUtils extends UtilsRecord = {}> = TContext extends SingleResult ? CollectionConfigSingleRowOption<TResult, string | number, never, TUtils> & SingleResult : CollectionConfigSingleRowOption<TResult, string | number, never, TUtils> & NonSingleResult;
type CollectionForContext<TContext extends Context, TResult extends object, TUtils extends UtilsRecord = {}> = TContext extends SingleResult ? Collection<TResult, string | number, TUtils> & SingleResult : Collection<TResult, string | number, TUtils> & NonSingleResult;
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
export declare function liveQueryCollectionOptions<TContext extends Context, TResult extends object = GetResult<TContext>>(config: LiveQueryCollectionConfig<TContext, TResult>): CollectionConfigForContext<TContext, TResult> & {
    utils: LiveQueryCollectionUtils;
};
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
export declare function createLiveQueryCollection<TContext extends Context, TResult extends object = GetResult<TContext>>(query: (q: InitialQueryBuilder) => QueryBuilder<TContext>): CollectionForContext<TContext, TResult> & {
    utils: LiveQueryCollectionUtils;
};
export declare function createLiveQueryCollection<TContext extends Context, TResult extends object = GetResult<TContext>, TUtils extends UtilsRecord = {}>(config: LiveQueryCollectionConfig<TContext, TResult> & {
    utils?: TUtils;
}): CollectionForContext<TContext, TResult> & {
    utils: LiveQueryCollectionUtils & TUtils;
};
export {};
