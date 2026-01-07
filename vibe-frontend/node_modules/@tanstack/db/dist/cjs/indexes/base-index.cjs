"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const evaluators = require("../query/compiler/evaluators.cjs");
const functions = require("../query/builder/functions.cjs");
const utils = require("../utils.cjs");
const IndexOperation = functions.comparisonFunctions;
class BaseIndex {
  constructor(id, expression, name, options) {
    this.lookupCount = 0;
    this.totalLookupTime = 0;
    this.lastUpdated = /* @__PURE__ */ new Date();
    this.id = id;
    this.expression = expression;
    this.compareOptions = utils.DEFAULT_COMPARE_OPTIONS;
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
    return utils.deepEquals(
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
    const evaluator = evaluators.compileSingleRowExpression(this.expression);
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
exports.BaseIndex = BaseIndex;
exports.IndexOperation = IndexOperation;
//# sourceMappingURL=base-index.cjs.map
