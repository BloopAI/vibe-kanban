import {
  isPredicateSubset,
  isWhereSubset,
  minusWherePredicates,
  unionWherePredicates,
} from './predicate-utils.js'
import type { BasicExpression } from './ir.js'
import type { LoadSubsetOptions } from '../types.js'

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
export class DeduplicatedLoadSubset {
  // The underlying loadSubset function to wrap
  private readonly _loadSubset: (
    options: LoadSubsetOptions,
  ) => true | Promise<void>

  // An optional callback function that is invoked when a loadSubset call is deduplicated.
  private readonly onDeduplicate:
    | ((options: LoadSubsetOptions) => void)
    | undefined

  // Combined where predicate for all unlimited calls (no limit)
  private unlimitedWhere: BasicExpression<boolean> | undefined = undefined

  // Flag to track if we've loaded all data (unlimited call with no where clause)
  private hasLoadedAllData = false

  // List of all limited calls (with limit, possibly with orderBy)
  // We clone options before storing to prevent mutation of stored predicates
  private limitedCalls: Array<LoadSubsetOptions> = []

  // Track in-flight calls to prevent concurrent duplicate requests
  // We store both the options and the promise so we can apply subset logic
  private inflightCalls: Array<{
    options: LoadSubsetOptions
    promise: Promise<void>
  }> = []

  // Generation counter to invalidate in-flight requests after reset()
  // When reset() is called, this increments, and any in-flight completion handlers
  // check if their captured generation matches before updating tracking state
  private generation = 0

  constructor(opts: {
    loadSubset: (options: LoadSubsetOptions) => true | Promise<void>
    onDeduplicate?: (options: LoadSubsetOptions) => void
  }) {
    this._loadSubset = opts.loadSubset
    this.onDeduplicate = opts.onDeduplicate
  }

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
  loadSubset = (options: LoadSubsetOptions): true | Promise<void> => {
    // If we've loaded all data, everything is covered
    if (this.hasLoadedAllData) {
      this.onDeduplicate?.(options)
      return true
    }

    // Check against unlimited combined predicate
    // If we've loaded all data matching a where clause, we don't need to refetch subsets
    if (this.unlimitedWhere !== undefined && options.where !== undefined) {
      if (isWhereSubset(options.where, this.unlimitedWhere)) {
        this.onDeduplicate?.(options)
        return true // Data already loaded via unlimited call
      }
    }

    // Check against limited calls
    if (options.limit !== undefined) {
      const alreadyLoaded = this.limitedCalls.some((loaded) =>
        isPredicateSubset(options, loaded),
      )

      if (alreadyLoaded) {
        this.onDeduplicate?.(options)
        return true // Already loaded
      }
    }

    // Check against in-flight calls using the same subset logic as resolved calls
    // This prevents duplicate requests when concurrent calls have subset relationships
    const matchingInflight = this.inflightCalls.find((inflight) =>
      isPredicateSubset(options, inflight.options),
    )

    if (matchingInflight !== undefined) {
      // An in-flight call will load data that covers this request
      // Return the same promise so this caller waits for the data to load
      // The in-flight promise already handles tracking updates when it completes
      const prom = matchingInflight.promise
      // Call `onDeduplicate` when the inflight request has loaded the data
      prom.then(() => this.onDeduplicate?.(options)).catch() // ignore errors
      return prom
    }

    // Not fully covered by existing data
    // Compute the subset of data that is not covered by the existing data
    // such that we only have to load that subset of missing data
    const clonedOptions = cloneOptions(options)
    if (this.unlimitedWhere !== undefined && options.limit === undefined) {
      // Compute difference to get only the missing data
      // We can only do this for unlimited queries
      // and we can only remove data that was loaded from unlimited queries
      // because with limited queries we have no way to express that we already loaded part of the matching data
      clonedOptions.where =
        minusWherePredicates(clonedOptions.where, this.unlimitedWhere) ??
        clonedOptions.where
    }

    // Call underlying loadSubset to load the missing data
    const resultPromise = this._loadSubset(clonedOptions)

    // Handle both sync (true) and async (Promise<void>) return values
    if (resultPromise === true) {
      // Sync return - update tracking synchronously
      // Clone options before storing to protect against caller mutation
      this.updateTracking(clonedOptions)
      return true
    } else {
      // Async return - track the promise and update tracking after it resolves

      // Capture the current generation - this lets us detect if reset() was called
      // while this request was in-flight, so we can skip updating tracking state
      const capturedGeneration = this.generation

      // We need to create a reference to the in-flight entry so we can remove it later
      const inflightEntry = {
        options: clonedOptions, // Store cloned options for subset matching
        promise: resultPromise
          .then((result) => {
            // Only update tracking if this request is still from the current generation
            // If reset() was called, the generation will have incremented and we should
            // not repopulate the state that was just cleared
            if (capturedGeneration === this.generation) {
              // Use the cloned options that we captured before any caller mutations
              // This ensures we track exactly what was loaded, not what the caller changed
              this.updateTracking(clonedOptions)
            }
            return result
          })
          .finally(() => {
            // Always remove from in-flight array on completion OR rejection
            // This ensures failed requests can be retried instead of being cached forever
            const index = this.inflightCalls.indexOf(inflightEntry)
            if (index !== -1) {
              this.inflightCalls.splice(index, 1)
            }
          }),
      }

      // Store the in-flight entry so concurrent subset calls can wait for it
      this.inflightCalls.push(inflightEntry)
      return inflightEntry.promise
    }
  }

  /**
   * Reset all tracking state.
   * Clears the history of loaded predicates and in-flight calls.
   * Use this when you want to start fresh, for example after clearing the underlying data store.
   *
   * Note: Any in-flight requests will still complete, but they will not update the tracking
   * state after the reset. This prevents old requests from repopulating cleared state.
   */
  reset(): void {
    this.unlimitedWhere = undefined
    this.hasLoadedAllData = false
    this.limitedCalls = []
    this.inflightCalls = []
    // Increment generation to invalidate any in-flight completion handlers
    // This ensures requests that were started before reset() don't repopulate the state
    this.generation++
  }

  private updateTracking(options: LoadSubsetOptions): void {
    // Update tracking based on whether this was a limited or unlimited call
    if (options.limit === undefined) {
      // Unlimited call - update combined where predicate
      // We ignore orderBy for unlimited calls as mentioned in requirements
      if (options.where === undefined) {
        // No where clause = all data loaded
        this.hasLoadedAllData = true
        this.unlimitedWhere = undefined
        this.limitedCalls = []
        this.inflightCalls = []
      } else if (this.unlimitedWhere === undefined) {
        this.unlimitedWhere = options.where
      } else {
        this.unlimitedWhere = unionWherePredicates([
          this.unlimitedWhere,
          options.where,
        ])
      }
    } else {
      // Limited call - add to list for future subset checks
      // Options are already cloned by caller to prevent mutation issues
      this.limitedCalls.push(options)
    }
  }
}

/**
 * Clones a LoadSubsetOptions object to prevent mutation of stored predicates.
 * This is crucial because callers often reuse the same options object and mutate
 * properties like limit or where between calls. Without cloning, our stored history
 * would reflect the mutated values rather than what was actually loaded.
 */
export function cloneOptions(options: LoadSubsetOptions): LoadSubsetOptions {
  return { ...options }
}
