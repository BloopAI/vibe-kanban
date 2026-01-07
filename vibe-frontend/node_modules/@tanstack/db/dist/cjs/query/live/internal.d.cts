import { CollectionConfigBuilder } from './collection-config-builder.js';
/**
 * Symbol for accessing internal utilities that should not be part of the public API
 */
export declare const LIVE_QUERY_INTERNAL: unique symbol;
/**
 * Internal utilities for live queries, accessible via Symbol
 */
export type LiveQueryInternalUtils = {
    getBuilder: () => CollectionConfigBuilder<any, any>;
    hasCustomGetKey: boolean;
    hasJoins: boolean;
};
