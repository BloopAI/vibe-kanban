"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const dbIvm = require("@tanstack/db-ivm");
const comparison = require("../../utils/comparison.cjs");
const ir = require("../ir.cjs");
const autoIndex = require("../../indexes/auto-index.cjs");
const indexOptimization = require("../../utils/index-optimization.cjs");
const evaluators = require("./evaluators.cjs");
const groupBy = require("./group-by.cjs");
function processOrderBy(rawQuery, pipeline, orderByClause, selectClause, collection, optimizableOrderByCollections, setWindowFn, limit, offset) {
  const compiledOrderBy = orderByClause.map((clause) => {
    const clauseWithoutAggregates = groupBy.replaceAggregatesByRefs(
      clause.expression,
      selectClause,
      `__select_results`
    );
    return {
      compiledExpression: evaluators.compileExpression(clauseWithoutAggregates),
      compareOptions: buildCompareOptions(clause, collection)
    };
  });
  const valueExtractor = (row) => {
    const orderByContext = row;
    if (orderByClause.length > 1) {
      return compiledOrderBy.map(
        (compiled) => compiled.compiledExpression(orderByContext)
      );
    } else if (orderByClause.length === 1) {
      const compiled = compiledOrderBy[0];
      return compiled.compiledExpression(orderByContext);
    }
    return null;
  };
  const compare = (a, b) => {
    if (orderByClause.length > 1) {
      const arrayA = a;
      const arrayB = b;
      for (let i = 0; i < orderByClause.length; i++) {
        const clause = compiledOrderBy[i];
        const compareFn = comparison.makeComparator(clause.compareOptions);
        const result = compareFn(arrayA[i], arrayB[i]);
        if (result !== 0) {
          return result;
        }
      }
      return arrayA.length - arrayB.length;
    }
    if (orderByClause.length === 1) {
      const clause = compiledOrderBy[0];
      const compareFn = comparison.makeComparator(clause.compareOptions);
      return compareFn(a, b);
    }
    return comparison.defaultComparator(a, b);
  };
  let setSizeCallback;
  let orderByOptimizationInfo;
  if (limit) {
    let index;
    let followRefCollection;
    let firstColumnValueExtractor;
    let orderByAlias = rawQuery.from.alias;
    const firstClause = orderByClause[0];
    const firstOrderByExpression = firstClause.expression;
    if (firstOrderByExpression.type === `ref`) {
      const followRefResult = ir.followRef(
        rawQuery,
        firstOrderByExpression,
        collection
      );
      if (followRefResult) {
        followRefCollection = followRefResult.collection;
        const fieldName = followRefResult.path[0];
        const compareOpts = buildCompareOptions(
          firstClause,
          followRefCollection
        );
        if (fieldName) {
          autoIndex.ensureIndexForField(
            fieldName,
            followRefResult.path,
            followRefCollection,
            compareOpts,
            compare
          );
        }
        firstColumnValueExtractor = evaluators.compileExpression(
          new ir.PropRef(followRefResult.path),
          true
        );
        index = indexOptimization.findIndexForField(
          followRefCollection,
          followRefResult.path,
          compareOpts
        );
        if (!index?.supports(`gt`)) {
          index = void 0;
        }
        orderByAlias = firstOrderByExpression.path.length > 1 ? String(firstOrderByExpression.path[0]) : rawQuery.from.alias;
      }
    }
    if (!firstColumnValueExtractor) ;
    else {
      const allColumnsAreRefs = orderByClause.every(
        (clause) => clause.expression.type === `ref`
      );
      const allColumnExtractors = allColumnsAreRefs ? orderByClause.map((clause) => {
        const refExpr = clause.expression;
        const followResult = ir.followRef(rawQuery, refExpr, collection);
        if (followResult) {
          return evaluators.compileExpression(
            new ir.PropRef(followResult.path),
            true
          );
        }
        return evaluators.compileExpression(
          clause.expression,
          true
        );
      }) : void 0;
      const comparator = (a, b) => {
        if (orderByClause.length === 1) {
          const extractedA = a ? firstColumnValueExtractor(a) : a;
          const extractedB = b ? firstColumnValueExtractor(b) : b;
          return compare(extractedA, extractedB);
        }
        if (allColumnExtractors) {
          const extractAll = (row) => {
            if (!row) return row;
            return allColumnExtractors.map((extractor) => extractor(row));
          };
          return compare(extractAll(a), extractAll(b));
        }
        return 0;
      };
      const rawRowValueExtractor = (row) => {
        if (orderByClause.length === 1) {
          return firstColumnValueExtractor(row);
        }
        if (allColumnExtractors) {
          return allColumnExtractors.map((extractor) => extractor(row));
        }
        return void 0;
      };
      orderByOptimizationInfo = {
        alias: orderByAlias,
        offset: offset ?? 0,
        limit,
        comparator,
        valueExtractorForRawRow: rawRowValueExtractor,
        firstColumnValueExtractor,
        index,
        orderBy: orderByClause
      };
      const targetCollectionId = followRefCollection?.id ?? collection.id;
      optimizableOrderByCollections[targetCollectionId] = orderByOptimizationInfo;
      if (index) {
        setSizeCallback = (getSize) => {
          optimizableOrderByCollections[targetCollectionId][`dataNeeded`] = () => {
            const size = getSize();
            return Math.max(0, orderByOptimizationInfo.limit - size);
          };
        };
      }
    }
  }
  return pipeline.pipe(
    dbIvm.orderByWithFractionalIndex(valueExtractor, {
      limit,
      offset,
      comparator: compare,
      setSizeCallback,
      setWindowFn: (windowFn) => {
        setWindowFn(
          // We wrap the move function such that we update the orderByOptimizationInfo
          // because that is used by the `dataNeeded` callback to determine if we need to load more data
          (options) => {
            windowFn(options);
            if (orderByOptimizationInfo) {
              orderByOptimizationInfo.offset = options.offset ?? orderByOptimizationInfo.offset;
              orderByOptimizationInfo.limit = options.limit ?? orderByOptimizationInfo.limit;
            }
          }
        );
      }
    })
    // orderByWithFractionalIndex returns [key, [value, index]] - we keep this format
  );
}
function buildCompareOptions(clause, collection) {
  if (clause.compareOptions.stringSort !== void 0) {
    return clause.compareOptions;
  }
  return {
    ...collection.compareOptions,
    direction: clause.compareOptions.direction,
    nulls: clause.compareOptions.nulls
  };
}
exports.buildCompareOptions = buildCompareOptions;
exports.processOrderBy = processOrderBy;
//# sourceMappingURL=order-by.cjs.map
