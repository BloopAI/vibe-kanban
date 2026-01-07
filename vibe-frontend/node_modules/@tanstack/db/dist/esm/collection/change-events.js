import { compileSingleRowExpression, toBooleanPredicate } from "../query/compiler/evaluators.js";
import { optimizeExpressionWithIndexes, findIndexForField } from "../utils/index-optimization.js";
import { ensureIndexForField } from "../indexes/auto-index.js";
import { makeComparator } from "../utils/comparison.js";
import { buildCompareOptions } from "../query/compiler/order-by.js";
function currentStateAsChanges(collection, options = {}) {
  const collectFilteredResults = (filterFn) => {
    const result = [];
    for (const [key, value] of collection.entries()) {
      if (filterFn?.(value) ?? true) {
        result.push({
          type: `insert`,
          key,
          value
        });
      }
    }
    return result;
  };
  if (options.limit !== void 0 && !options.orderBy) {
    throw new Error(`limit cannot be used without orderBy`);
  }
  if (options.orderBy) {
    const whereFilter = options.where ? createFilterFunctionFromExpression(options.where) : void 0;
    const orderedKeys = getOrderedKeys(
      collection,
      options.orderBy,
      options.limit,
      whereFilter,
      options.optimizedOnly
    );
    if (orderedKeys === void 0) {
      return;
    }
    const result = [];
    for (const key of orderedKeys) {
      const value = collection.get(key);
      if (value !== void 0) {
        result.push({
          type: `insert`,
          key,
          value
        });
      }
    }
    return result;
  }
  if (!options.where) {
    return collectFilteredResults();
  }
  try {
    const expression = options.where;
    const optimizationResult = optimizeExpressionWithIndexes(
      expression,
      collection
    );
    if (optimizationResult.canOptimize) {
      const result = [];
      for (const key of optimizationResult.matchingKeys) {
        const value = collection.get(key);
        if (value !== void 0) {
          result.push({
            type: `insert`,
            key,
            value
          });
        }
      }
      return result;
    } else {
      if (options.optimizedOnly) {
        return;
      }
      const filterFn = createFilterFunctionFromExpression(expression);
      return collectFilteredResults(filterFn);
    }
  } catch (error) {
    console.warn(
      `${collection.id ? `[${collection.id}] ` : ``}Error processing where clause, falling back to full scan:`,
      error
    );
    const filterFn = createFilterFunctionFromExpression(options.where);
    if (options.optimizedOnly) {
      return;
    }
    return collectFilteredResults(filterFn);
  }
}
function createFilterFunctionFromExpression(expression) {
  const evaluator = compileSingleRowExpression(expression);
  return (item) => {
    try {
      const result = evaluator(item);
      return toBooleanPredicate(result);
    } catch {
      return false;
    }
  };
}
function createFilteredCallback(originalCallback, options) {
  const filterFn = createFilterFunctionFromExpression(options.whereExpression);
  return (changes) => {
    const filteredChanges = [];
    for (const change of changes) {
      if (change.type === `insert`) {
        if (filterFn(change.value)) {
          filteredChanges.push(change);
        }
      } else if (change.type === `update`) {
        const newValueMatches = filterFn(change.value);
        const oldValueMatches = change.previousValue ? filterFn(change.previousValue) : false;
        if (newValueMatches && oldValueMatches) {
          filteredChanges.push(change);
        } else if (newValueMatches && !oldValueMatches) {
          filteredChanges.push({
            ...change,
            type: `insert`
          });
        } else if (!newValueMatches && oldValueMatches) {
          filteredChanges.push({
            ...change,
            type: `delete`,
            value: change.previousValue
            // Use the previous value for the delete
          });
        }
      } else {
        if (filterFn(change.value)) {
          filteredChanges.push(change);
        }
      }
    }
    if (filteredChanges.length > 0 || changes.length === 0) {
      originalCallback(filteredChanges);
    }
  };
}
function getOrderedKeys(collection, orderBy, limit, whereFilter, optimizedOnly) {
  if (orderBy.length === 1) {
    const clause = orderBy[0];
    const orderByExpression = clause.expression;
    if (orderByExpression.type === `ref`) {
      const propRef = orderByExpression;
      const fieldPath = propRef.path;
      const compareOpts = buildCompareOptions(clause, collection);
      ensureIndexForField(
        fieldPath[0],
        fieldPath,
        collection,
        compareOpts
      );
      const index = findIndexForField(collection, fieldPath, compareOpts);
      if (index && index.supports(`gt`)) {
        const filterFn = (key) => {
          const value = collection.get(key);
          if (value === void 0) {
            return false;
          }
          return whereFilter?.(value) ?? true;
        };
        return index.take(limit ?? index.keyCount, void 0, filterFn);
      }
    }
  }
  if (optimizedOnly) {
    return;
  }
  const allItems = [];
  for (const [key, value] of collection.entries()) {
    if (whereFilter?.(value) ?? true) {
      allItems.push({ key, value });
    }
  }
  const compare = (a, b) => {
    for (const clause of orderBy) {
      const compareFn = makeComparator(clause.compareOptions);
      const aValue = extractValueFromItem(a.value, clause.expression);
      const bValue = extractValueFromItem(b.value, clause.expression);
      const result = compareFn(aValue, bValue);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  };
  allItems.sort(compare);
  const sortedKeys = allItems.map((item) => item.key);
  if (limit !== void 0) {
    return sortedKeys.slice(0, limit);
  }
  return sortedKeys;
}
function extractValueFromItem(item, expression) {
  if (expression.type === `ref`) {
    const propRef = expression;
    let value = item;
    for (const pathPart of propRef.path) {
      value = value?.[pathPart];
    }
    return value;
  } else if (expression.type === `val`) {
    return expression.value;
  } else {
    const evaluator = compileSingleRowExpression(expression);
    return evaluator(item);
  }
}
export {
  createFilterFunctionFromExpression,
  createFilteredCallback,
  currentStateAsChanges
};
//# sourceMappingURL=change-events.js.map
