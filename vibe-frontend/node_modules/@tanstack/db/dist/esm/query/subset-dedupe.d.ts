import { LoadSubsetOptions } from '../types.js';
/**
 * Deduplicated wrapper for a loadSubset function.
 * Tracks what data has been loaded and avoids redundant calls by applying
 * subset logic to predicates.
 *
 * @param opts - The options for the DeduplicatedLoadSubset
 * @param opts.loadSubset - The underlying loadSubset function to wrap
 * @param opts.onDeduplicate - An optional callback function that is invoked when a loadSubset call is deduplicated.
 *                              If the call is deduplicated because the requested data is being loaded by an inflight request,
 *                              then this callback is invoked when the inflight request completes successfully and the data is fully loaded.
 *                              This callback is useful if you need to track rows per query, in which case you can't ignore deduplicated calls
 *                              because you need to know which rows were loaded for each query.
 * @example
 * const dedupe = new DeduplicatedLoadSubset({ loadSubset: myLoadSubset, onDeduplicate: (opts) => console.log(`Call was deduplicated:`, opts) })
 *
 * // First call - fetches data
 * await dedupe.loadSubset({ where: gt(ref('age'), val(10)) })
 *
 * // Second call - subset of first, returns true immediately
 * await dedupe.loadSubset({ where: gt(ref('age'), val(20)) })
 *
 * // Clear state to start fresh
 * dedupe.reset()
 */
export declare class DeduplicatedLoadSubset {
    private readonly _loadSubset;
    private readonly onDeduplicate;
    private unlimitedWhere;
    private hasLoadedAllData;
    private limitedCalls;
    private inflightCalls;
    private generation;
    constructor(opts: {
        loadSubset: (options: LoadSubsetOptions) => true | Promise<void>;
        onDeduplicate?: (options: LoadSubsetOptions) => void;
    });
    /**
     * Load a subset of data, with automatic deduplication based on previously
     * loaded predicates and in-flight requests.
     *
     * This method is auto-bound, so it can be safely passed as a callback without
     * losing its `this` context (e.g., `loadSubset: dedupe.loadSubset` in a sync config).
     *
     * @param options - The predicate options (where, orderBy, limit)
     * @returns true if data is already loaded, or a Promise that resolves when data is loaded
     */
    loadSubset: (options: LoadSubsetOptions) => true | Promise<void>;
    /**
     * Reset all tracking state.
     * Clears the history of loaded predicates and in-flight calls.
     * Use this when you want to start fresh, for example after clearing the underlying data store.
     *
     * Note: Any in-flight requests will still complete, but they will not update the tracking
     * state after the reset. This prevents old requests from repopulating cleared state.
     */
    reset(): void;
    private updateTracking;
}
/**
 * Clones a LoadSubsetOptions object to prevent mutation of stored predicates.
 * This is crucial because callers often reuse the same options object and mutate
 * properties like limit or where between calls. Without cloning, our stored history
 * would reflect the mutated values rather than what was actually loaded.
 */
export declare function cloneOptions(options: LoadSubsetOptions): LoadSubsetOptions;
