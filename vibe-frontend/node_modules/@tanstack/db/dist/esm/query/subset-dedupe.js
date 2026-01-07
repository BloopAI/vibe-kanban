import { isWhereSubset, isPredicateSubset, minusWherePredicates, unionWherePredicates } from "./predicate-utils.js";
class DeduplicatedLoadSubset {
  constructor(opts) {
    this.unlimitedWhere = void 0;
    this.hasLoadedAllData = false;
    this.limitedCalls = [];
    this.inflightCalls = [];
    this.generation = 0;
    this.loadSubset = (options) => {
      if (this.hasLoadedAllData) {
        this.onDeduplicate?.(options);
        return true;
      }
      if (this.unlimitedWhere !== void 0 && options.where !== void 0) {
        if (isWhereSubset(options.where, this.unlimitedWhere)) {
          this.onDeduplicate?.(options);
          return true;
        }
      }
      if (options.limit !== void 0) {
        const alreadyLoaded = this.limitedCalls.some(
          (loaded) => isPredicateSubset(options, loaded)
        );
        if (alreadyLoaded) {
          this.onDeduplicate?.(options);
          return true;
        }
      }
      const matchingInflight = this.inflightCalls.find(
        (inflight) => isPredicateSubset(options, inflight.options)
      );
      if (matchingInflight !== void 0) {
        const prom = matchingInflight.promise;
        prom.then(() => this.onDeduplicate?.(options)).catch();
        return prom;
      }
      const clonedOptions = cloneOptions(options);
      if (this.unlimitedWhere !== void 0 && options.limit === void 0) {
        clonedOptions.where = minusWherePredicates(clonedOptions.where, this.unlimitedWhere) ?? clonedOptions.where;
      }
      const resultPromise = this._loadSubset(clonedOptions);
      if (resultPromise === true) {
        this.updateTracking(clonedOptions);
        return true;
      } else {
        const capturedGeneration = this.generation;
        const inflightEntry = {
          options: clonedOptions,
          // Store cloned options for subset matching
          promise: resultPromise.then((result) => {
            if (capturedGeneration === this.generation) {
              this.updateTracking(clonedOptions);
            }
            return result;
          }).finally(() => {
            const index = this.inflightCalls.indexOf(inflightEntry);
            if (index !== -1) {
              this.inflightCalls.splice(index, 1);
            }
          })
        };
        this.inflightCalls.push(inflightEntry);
        return inflightEntry.promise;
      }
    };
    this._loadSubset = opts.loadSubset;
    this.onDeduplicate = opts.onDeduplicate;
  }
  /**
   * Reset all tracking state.
   * Clears the history of loaded predicates and in-flight calls.
   * Use this when you want to start fresh, for example after clearing the underlying data store.
   *
   * Note: Any in-flight requests will still complete, but they will not update the tracking
   * state after the reset. This prevents old requests from repopulating cleared state.
   */
  reset() {
    this.unlimitedWhere = void 0;
    this.hasLoadedAllData = false;
    this.limitedCalls = [];
    this.inflightCalls = [];
    this.generation++;
  }
  updateTracking(options) {
    if (options.limit === void 0) {
      if (options.where === void 0) {
        this.hasLoadedAllData = true;
        this.unlimitedWhere = void 0;
        this.limitedCalls = [];
        this.inflightCalls = [];
      } else if (this.unlimitedWhere === void 0) {
        this.unlimitedWhere = options.where;
      } else {
        this.unlimitedWhere = unionWherePredicates([
          this.unlimitedWhere,
          options.where
        ]);
      }
    } else {
      this.limitedCalls.push(options);
    }
  }
}
function cloneOptions(options) {
  return { ...options };
}
export {
  DeduplicatedLoadSubset,
  cloneOptions
};
//# sourceMappingURL=subset-dedupe.js.map
