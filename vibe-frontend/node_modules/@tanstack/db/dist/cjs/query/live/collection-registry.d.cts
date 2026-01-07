import { Collection } from '../../collection/index.js';
import { CollectionConfigBuilder } from './collection-config-builder.js';
/**
 * Retrieves the builder attached to a config object via its internal utils.
 *
 * @param config - The collection config object
 * @returns The attached builder, or `undefined` if none exists
 */
export declare function getBuilderFromConfig(config: object): CollectionConfigBuilder<any, any> | undefined;
/**
 * Registers a builder for a collection in the global registry.
 * Used to detect when a live query depends on another live query,
 * enabling the scheduler to ensure parent queries run first.
 *
 * @param collection - The collection to register the builder for
 * @param builder - The builder that produces this collection
 */
export declare function registerCollectionBuilder(collection: Collection<any, any, any>, builder: CollectionConfigBuilder<any, any>): void;
/**
 * Retrieves the builder registered for a collection.
 * Used to discover dependencies when a live query subscribes to another live query.
 *
 * @param collection - The collection to look up
 * @returns The registered builder, or `undefined` if none exists
 */
export declare function getCollectionBuilder(collection: Collection<any, any, any>): CollectionConfigBuilder<any, any> | undefined;
