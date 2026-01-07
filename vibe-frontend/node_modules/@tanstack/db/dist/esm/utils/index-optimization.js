import { DEFAULT_COMPARE_OPTIONS } from "../utils.js";
import { ReverseIndex } from "../indexes/reverse-index.js";
function findIndexForField(collection, fieldPath, compareOptions) {
  const compareOpts = compareOptions ?? {
    ...DEFAULT_COMPARE_OPTIONS,
    ...collection.compareOptions
  };
  for (const index of collection.indexes.values()) {
    if (index.matchesField(fieldPath) && index.matchesCompareOptions(compareOpts)) {
      if (!index.matchesDirection(compareOpts.direction)) {
        return new ReverseIndex(index);
      }
      return index;
    }
  }
  return void 0;
}
function intersectSets(sets) {
  if (sets.length === 0) return /* @__PURE__ */ new Set();
  if (sets.length === 1) return new Set(sets[0]);
  let result = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    const newResult = /* @__PURE__ */ new Set();
    for (const item of result) {
      if (sets[i].has(item)) {
        newResult.add(item);
      }
    }
    result = newResult;
  }
  return result;
}
function unionSets(sets) {
  const result = /* @__PURE__ */ new Set();
  for (const set of sets) {
    for (const item of set) {
      result.add(item);
    }
  }
  return result;
}
function optimizeExpressionWithIndexes(expression, collection) {
  return optimizeQueryRecursive(expression, collection);
}
function optimizeQueryRecursive(expression, collection) {
  if (expression.type === `func`) {
    switch (expression.name) {
      case `eq`:
      case `gt`:
      case `gte`:
      case `lt`:
      case `lte`:
        return optimizeSimpleComparison(expression, collection);
      case `and`:
        return optimizeAndExpression(expression, collection);
      case `or`:
        return optimizeOrExpression(expression, collection);
      case `in`:
        return optimizeInArrayExpression(expression, collection);
    }
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeCompoundRangeQuery(expression, collection) {
  if (expression.type !== `func` || expression.args.length < 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const fieldOperations = /* @__PURE__ */ new Map();
  for (const arg of expression.args) {
    if (arg.type === `func` && [`gt`, `gte`, `lt`, `lte`].includes(arg.name)) {
      const rangeOp = arg;
      if (rangeOp.args.length === 2) {
        const leftArg = rangeOp.args[0];
        const rightArg = rangeOp.args[1];
        let fieldArg = null;
        let valueArg = null;
        let operation = rangeOp.name;
        if (leftArg.type === `ref` && rightArg.type === `val`) {
          fieldArg = leftArg;
          valueArg = rightArg;
        } else if (leftArg.type === `val` && rightArg.type === `ref`) {
          fieldArg = rightArg;
          valueArg = leftArg;
          switch (operation) {
            case `gt`:
              operation = `lt`;
              break;
            case `gte`:
              operation = `lte`;
              break;
            case `lt`:
              operation = `gt`;
              break;
            case `lte`:
              operation = `gte`;
              break;
          }
        }
        if (fieldArg && valueArg) {
          const fieldPath = fieldArg.path;
          const fieldKey = fieldPath.join(`.`);
          const value = valueArg.value;
          if (!fieldOperations.has(fieldKey)) {
            fieldOperations.set(fieldKey, []);
          }
          fieldOperations.get(fieldKey).push({ operation, value });
        }
      }
    }
  }
  for (const [fieldKey, operations] of fieldOperations) {
    if (operations.length >= 2) {
      const fieldPath = fieldKey.split(`.`);
      const index = findIndexForField(collection, fieldPath);
      if (index && index.supports(`gt`) && index.supports(`lt`)) {
        let from = void 0;
        let to = void 0;
        let fromInclusive = true;
        let toInclusive = true;
        for (const { operation, value } of operations) {
          switch (operation) {
            case `gt`:
              if (from === void 0 || value > from) {
                from = value;
                fromInclusive = false;
              }
              break;
            case `gte`:
              if (from === void 0 || value > from) {
                from = value;
                fromInclusive = true;
              }
              break;
            case `lt`:
              if (to === void 0 || value < to) {
                to = value;
                toInclusive = false;
              }
              break;
            case `lte`:
              if (to === void 0 || value < to) {
                to = value;
                toInclusive = true;
              }
              break;
          }
        }
        const matchingKeys = index.rangeQuery({
          from,
          to,
          fromInclusive,
          toInclusive
        });
        return { canOptimize: true, matchingKeys };
      }
    }
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeSimpleComparison(expression, collection) {
  if (expression.type !== `func` || expression.args.length !== 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const leftArg = expression.args[0];
  const rightArg = expression.args[1];
  let fieldArg = null;
  let valueArg = null;
  let operation = expression.name;
  if (leftArg.type === `ref` && rightArg.type === `val`) {
    fieldArg = leftArg;
    valueArg = rightArg;
  } else if (leftArg.type === `val` && rightArg.type === `ref`) {
    fieldArg = rightArg;
    valueArg = leftArg;
    switch (operation) {
      case `gt`:
        operation = `lt`;
        break;
      case `gte`:
        operation = `lte`;
        break;
      case `lt`:
        operation = `gt`;
        break;
      case `lte`:
        operation = `gte`;
        break;
    }
  }
  if (fieldArg && valueArg) {
    const fieldPath = fieldArg.path;
    const index = findIndexForField(collection, fieldPath);
    if (index) {
      const queryValue = valueArg.value;
      const indexOperation = operation;
      if (!index.supports(indexOperation)) {
        return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
      }
      const matchingKeys = index.lookup(indexOperation, queryValue);
      return { canOptimize: true, matchingKeys };
    }
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeAndExpression(expression, collection) {
  if (expression.type !== `func` || expression.args.length < 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const compoundRangeResult = optimizeCompoundRangeQuery(expression, collection);
  if (compoundRangeResult.canOptimize) {
    return compoundRangeResult;
  }
  const results = [];
  for (const arg of expression.args) {
    const result = optimizeQueryRecursive(arg, collection);
    if (result.canOptimize) {
      results.push(result);
    }
  }
  if (results.length > 0) {
    const allMatchingSets = results.map((r) => r.matchingKeys);
    const intersectedKeys = intersectSets(allMatchingSets);
    return { canOptimize: true, matchingKeys: intersectedKeys };
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeOrExpression(expression, collection) {
  if (expression.type !== `func` || expression.args.length < 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const results = [];
  for (const arg of expression.args) {
    const result = optimizeQueryRecursive(arg, collection);
    if (result.canOptimize) {
      results.push(result);
    }
  }
  if (results.length > 0) {
    const allMatchingSets = results.map((r) => r.matchingKeys);
    const unionedKeys = unionSets(allMatchingSets);
    return { canOptimize: true, matchingKeys: unionedKeys };
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeInArrayExpression(expression, collection) {
  if (expression.type !== `func` || expression.args.length !== 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const fieldArg = expression.args[0];
  const arrayArg = expression.args[1];
  if (fieldArg.type === `ref` && arrayArg.type === `val` && Array.isArray(arrayArg.value)) {
    const fieldPath = fieldArg.path;
    const values = arrayArg.value;
    const index = findIndexForField(collection, fieldPath);
    if (index) {
      if (index.supports(`in`)) {
        const matchingKeys = index.lookup(`in`, values);
        return { canOptimize: true, matchingKeys };
      } else if (index.supports(`eq`)) {
        const matchingKeys = /* @__PURE__ */ new Set();
        for (const value of values) {
          const keysForValue = index.lookup(`eq`, value);
          for (const key of keysForValue) {
            matchingKeys.add(key);
          }
        }
        return { canOptimize: true, matchingKeys };
      }
    }
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
export {
  findIndexForField,
  intersectSets,
  optimizeExpressionWithIndexes,
  unionSets
};
//# sourceMappingURL=index-optimization.js.map
