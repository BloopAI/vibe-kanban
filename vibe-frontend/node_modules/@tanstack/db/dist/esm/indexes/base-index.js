import { compileSingleRowExpression } from "../query/compiler/evaluators.js";
import { comparisonFunctions } from "../query/builder/functions.js";
import { DEFAULT_COMPARE_OPTIONS, deepEquals } from "../utils.js";
const IndexOperation = comparisonFunctions;
class BaseIndex {
  constructor(id, expression, name, options) {
    this.lookupCount = 0;
    this.totalLookupTime = 0;
    this.lastUpdated = /* @__PURE__ */ new Date();
    this.id = id;
    this.expression = expression;
    this.compareOptions = DEFAULT_COMPARE_OPTIONS;
    this.name = name;
    this.initialize(options);
  }
  // Common methods
  supports(operation) {
    return this.supportedOperations.has(operation);
  }
  matchesField(fieldPath) {
    return this.expression.type === `ref` && this.expression.path.length === fieldPath.length && this.expression.path.every((part, i) => part === fieldPath[i]);
  }
  /**
   * Checks if the compare options match the index's compare options.
   * The direction is ignored because the index can be reversed if the direction is different.
   */
  matchesCompareOptions(compareOptions) {
    const thisCompareOptionsWithoutDirection = {
      ...this.compareOptions,
      direction: void 0
    };
    const compareOptionsWithoutDirection = {
      ...compareOptions,
      direction: void 0
    };
    return deepEquals(
      thisCompareOptionsWithoutDirection,
      compareOptionsWithoutDirection
    );
  }
  /**
   * Checks if the index matches the provided direction.
   */
  matchesDirection(direction) {
    return this.compareOptions.direction === direction;
  }
  getStats() {
    return {
      entryCount: this.keyCount,
      lookupCount: this.lookupCount,
      averageLookupTime: this.lookupCount > 0 ? this.totalLookupTime / this.lookupCount : 0,
      lastUpdated: this.lastUpdated
    };
  }
  evaluateIndexExpression(item) {
    const evaluator = compileSingleRowExpression(this.expression);
    return evaluator(item);
  }
  trackLookup(startTime) {
    const duration = performance.now() - startTime;
    this.lookupCount++;
    this.totalLookupTime += duration;
  }
  updateTimestamp() {
    this.lastUpdated = /* @__PURE__ */ new Date();
  }
}
export {
  BaseIndex,
  IndexOperation
};
//# sourceMappingURL=base-index.js.map
