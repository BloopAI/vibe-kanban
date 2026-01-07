import { Func, Value } from "./ir.js";
function isWhereSubset(subset, superset) {
  if (subset === void 0 && superset === void 0) {
    return true;
  }
  if (subset === void 0 && superset !== void 0) {
    return false;
  }
  if (superset === void 0 && subset !== void 0) {
    return true;
  }
  return isWhereSubsetInternal(subset, superset);
}
function makeDisjunction(preds) {
  if (preds.length === 0) {
    return new Value(false);
  }
  if (preds.length === 1) {
    return preds[0];
  }
  return new Func(`or`, preds);
}
function convertInToOr(inField) {
  const equalities = inField.values.map(
    (value) => new Func(`eq`, [inField.ref, new Value(value)])
  );
  return makeDisjunction(equalities);
}
function isWhereSubsetInternal(subset, superset) {
  if (subset.type === `val` && subset.value === false) {
    return true;
  }
  if (areExpressionsEqual(subset, superset)) {
    return true;
  }
  if (superset.type === `func` && superset.name === `and`) {
    return superset.args.every(
      (arg) => isWhereSubsetInternal(subset, arg)
    );
  }
  if (subset.type === `func` && subset.name === `and`) {
    return subset.args.some(
      (arg) => isWhereSubsetInternal(arg, superset)
    );
  }
  if (subset.type === `func` && subset.name === `in`) {
    const inField = extractInField(subset);
    if (inField) {
      return isWhereSubsetInternal(convertInToOr(inField), superset);
    }
  }
  if (superset.type === `func` && superset.name === `in`) {
    const inField = extractInField(superset);
    if (inField) {
      return isWhereSubsetInternal(subset, convertInToOr(inField));
    }
  }
  if (subset.type === `func` && subset.name === `or`) {
    return subset.args.every(
      (arg) => isWhereSubsetInternal(arg, superset)
    );
  }
  if (superset.type === `func` && superset.name === `or`) {
    return superset.args.some(
      (arg) => isWhereSubsetInternal(subset, arg)
    );
  }
  if (subset.type === `func` && superset.type === `func`) {
    const subsetFunc = subset;
    const supersetFunc = superset;
    const subsetField = extractComparisonField(subsetFunc);
    const supersetField = extractComparisonField(supersetFunc);
    if (subsetField && supersetField && areRefsEqual(subsetField.ref, supersetField.ref)) {
      return isComparisonSubset(
        subsetFunc,
        subsetField.value,
        supersetFunc,
        supersetField.value
      );
    }
  }
  return false;
}
function combineWherePredicates(predicates, operation, simplifyFn) {
  const emptyValue = operation === `and` ? true : false;
  const identityValue = operation === `and` ? true : false;
  if (predicates.length === 0) {
    return { type: `val`, value: emptyValue };
  }
  if (predicates.length === 1) {
    return predicates[0];
  }
  const flatPredicates = [];
  for (const pred of predicates) {
    if (pred.type === `func` && pred.name === operation) {
      flatPredicates.push(...pred.args);
    } else {
      flatPredicates.push(pred);
    }
  }
  const grouped = groupPredicatesByField(flatPredicates);
  const simplified = [];
  for (const [field, preds] of grouped.entries()) {
    if (field === null) {
      simplified.push(...preds);
    } else {
      const result = simplifyFn(preds);
      if (result) {
        simplified.push(result);
      }
    }
  }
  if (simplified.length === 0) {
    return { type: `val`, value: identityValue };
  }
  if (simplified.length === 1) {
    return simplified[0];
  }
  return {
    type: `func`,
    name: operation,
    args: simplified
  };
}
function unionWherePredicates(predicates) {
  return combineWherePredicates(predicates, `or`, unionSameFieldPredicates);
}
function minusWherePredicates(fromPredicate, subtractPredicate) {
  if (subtractPredicate === void 0) {
    return fromPredicate ?? { type: `val`, value: true };
  }
  if (fromPredicate === void 0) {
    return {
      type: `func`,
      name: `not`,
      args: [subtractPredicate]
    };
  }
  if (isWhereSubset(fromPredicate, subtractPredicate)) {
    return { type: `val`, value: false };
  }
  const commonConditions = findCommonConditions(
    fromPredicate,
    subtractPredicate
  );
  if (commonConditions.length > 0) {
    const fromWithoutCommon = removeConditions(fromPredicate, commonConditions);
    const subtractWithoutCommon = removeConditions(
      subtractPredicate,
      commonConditions
    );
    const simplifiedDifference = minusWherePredicates(
      fromWithoutCommon,
      subtractWithoutCommon
    );
    if (simplifiedDifference !== null) {
      return combineConditions([...commonConditions, simplifiedDifference]);
    }
  }
  if (fromPredicate.type === `func` && subtractPredicate.type === `func`) {
    const result = minusSameFieldPredicates(fromPredicate, subtractPredicate);
    if (result !== null) {
      return result;
    }
  }
  return null;
}
function minusSameFieldPredicates(fromPred, subtractPred) {
  const fromField = extractComparisonField(fromPred) || extractEqualityField(fromPred) || extractInField(fromPred);
  const subtractField = extractComparisonField(subtractPred) || extractEqualityField(subtractPred) || extractInField(subtractPred);
  if (!fromField || !subtractField || !areRefsEqual(fromField.ref, subtractField.ref)) {
    return null;
  }
  if (fromPred.name === `in` && subtractPred.name === `in`) {
    const fromInField = fromField;
    const subtractInField = subtractField;
    const remainingValues = fromInField.values.filter(
      (v) => !arrayIncludesWithSet(
        subtractInField.values,
        v,
        subtractInField.primitiveSet ?? null,
        subtractInField.areAllPrimitives
      )
    );
    if (remainingValues.length === 0) {
      return { type: `val`, value: false };
    }
    if (remainingValues.length === 1) {
      return {
        type: `func`,
        name: `eq`,
        args: [fromField.ref, { type: `val`, value: remainingValues[0] }]
      };
    }
    return {
      type: `func`,
      name: `in`,
      args: [fromField.ref, { type: `val`, value: remainingValues }]
    };
  }
  if (fromPred.name === `in` && subtractPred.name === `eq`) {
    const fromInField = fromField;
    const subtractValue = subtractField.value;
    const remainingValues = fromInField.values.filter(
      (v) => !areValuesEqual(v, subtractValue)
    );
    if (remainingValues.length === 0) {
      return { type: `val`, value: false };
    }
    if (remainingValues.length === 1) {
      return {
        type: `func`,
        name: `eq`,
        args: [fromField.ref, { type: `val`, value: remainingValues[0] }]
      };
    }
    return {
      type: `func`,
      name: `in`,
      args: [fromField.ref, { type: `val`, value: remainingValues }]
    };
  }
  if (fromPred.name === `eq` && subtractPred.name === `eq`) {
    const fromValue = fromField.value;
    const subtractValue = subtractField.value;
    if (areValuesEqual(fromValue, subtractValue)) {
      return { type: `val`, value: false };
    }
    return fromPred;
  }
  const fromComp = extractComparisonField(fromPred);
  const subtractComp = extractComparisonField(subtractPred);
  if (fromComp && subtractComp && areRefsEqual(fromComp.ref, subtractComp.ref)) {
    const result = minusRangePredicates(
      fromPred,
      fromComp.value,
      subtractPred,
      subtractComp.value
    );
    return result;
  }
  return null;
}
function minusRangePredicates(fromFunc, fromValue, subtractFunc, subtractValue) {
  const fromOp = fromFunc.name;
  const subtractOp = subtractFunc.name;
  const ref = (extractComparisonField(fromFunc) || extractEqualityField(fromFunc)).ref;
  if (fromOp === `gt` && subtractOp === `gt`) {
    if (fromValue < subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          fromFunc,
          {
            type: `func`,
            name: `lte`,
            args: [ref, { type: `val`, value: subtractValue }]
          }
        ]
      };
    }
    return fromFunc;
  }
  if (fromOp === `gte` && subtractOp === `gte`) {
    if (fromValue < subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          fromFunc,
          {
            type: `func`,
            name: `lt`,
            args: [ref, { type: `val`, value: subtractValue }]
          }
        ]
      };
    }
    return fromFunc;
  }
  if (fromOp === `gt` && subtractOp === `gte`) {
    if (fromValue < subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          fromFunc,
          {
            type: `func`,
            name: `lt`,
            args: [ref, { type: `val`, value: subtractValue }]
          }
        ]
      };
    }
    return fromFunc;
  }
  if (fromOp === `gte` && subtractOp === `gt`) {
    if (fromValue <= subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          fromFunc,
          {
            type: `func`,
            name: `lte`,
            args: [ref, { type: `val`, value: subtractValue }]
          }
        ]
      };
    }
    return fromFunc;
  }
  if (fromOp === `lt` && subtractOp === `lt`) {
    if (fromValue > subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          {
            type: `func`,
            name: `gte`,
            args: [ref, { type: `val`, value: subtractValue }]
          },
          fromFunc
        ]
      };
    }
    return fromFunc;
  }
  if (fromOp === `lte` && subtractOp === `lte`) {
    if (fromValue > subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          {
            type: `func`,
            name: `gt`,
            args: [ref, { type: `val`, value: subtractValue }]
          },
          fromFunc
        ]
      };
    }
    return fromFunc;
  }
  if (fromOp === `lt` && subtractOp === `lte`) {
    if (fromValue > subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          {
            type: `func`,
            name: `gt`,
            args: [ref, { type: `val`, value: subtractValue }]
          },
          fromFunc
        ]
      };
    }
    return fromFunc;
  }
  if (fromOp === `lte` && subtractOp === `lt`) {
    if (fromValue >= subtractValue) {
      return {
        type: `func`,
        name: `and`,
        args: [
          {
            type: `func`,
            name: `gte`,
            args: [ref, { type: `val`, value: subtractValue }]
          },
          fromFunc
        ]
      };
    }
    return fromFunc;
  }
  return null;
}
function isOrderBySubset(subset, superset) {
  if (!subset || subset.length === 0) {
    return true;
  }
  if (!superset || superset.length === 0) {
    return false;
  }
  if (subset.length > superset.length) {
    return false;
  }
  for (let i = 0; i < subset.length; i++) {
    const subClause = subset[i];
    const superClause = superset[i];
    if (!areExpressionsEqual(subClause.expression, superClause.expression)) {
      return false;
    }
    if (!areCompareOptionsEqual(
      subClause.compareOptions,
      superClause.compareOptions
    )) {
      return false;
    }
  }
  return true;
}
function isLimitSubset(subset, superset) {
  if (superset === void 0) {
    return true;
  }
  if (subset === void 0) {
    return false;
  }
  return subset <= superset;
}
function isOffsetLimitSubset(subset, superset) {
  const subsetOffset = subset.offset ?? 0;
  const supersetOffset = superset.offset ?? 0;
  if (supersetOffset > subsetOffset) {
    return false;
  }
  if (superset.limit === void 0) {
    return true;
  }
  if (subset.limit === void 0) {
    return false;
  }
  const subsetEnd = subsetOffset + subset.limit;
  const supersetEnd = supersetOffset + superset.limit;
  return subsetEnd <= supersetEnd;
}
function isPredicateSubset(subset, superset) {
  if (superset.limit !== void 0) {
    if (!areWhereClausesEqual(subset.where, superset.where)) {
      return false;
    }
    return isOrderBySubset(subset.orderBy, superset.orderBy) && isOffsetLimitSubset(subset, superset);
  }
  return isWhereSubset(subset.where, superset.where) && isOrderBySubset(subset.orderBy, superset.orderBy) && isOffsetLimitSubset(subset, superset);
}
function areWhereClausesEqual(a, b) {
  if (a === void 0 && b === void 0) {
    return true;
  }
  if (a === void 0 || b === void 0) {
    return false;
  }
  return areExpressionsEqual(a, b);
}
function findCommonConditions(predicate1, predicate2) {
  const conditions1 = extractAllConditions(predicate1);
  const conditions2 = extractAllConditions(predicate2);
  const common = [];
  for (const cond1 of conditions1) {
    for (const cond2 of conditions2) {
      if (areExpressionsEqual(cond1, cond2)) {
        if (!common.some((c) => areExpressionsEqual(c, cond1))) {
          common.push(cond1);
        }
        break;
      }
    }
  }
  return common;
}
function extractAllConditions(predicate) {
  if (predicate.type === `func` && predicate.name === `and`) {
    const conditions = [];
    for (const arg of predicate.args) {
      conditions.push(...extractAllConditions(arg));
    }
    return conditions;
  }
  return [predicate];
}
function removeConditions(predicate, conditionsToRemove) {
  if (predicate.type === `func` && predicate.name === `and`) {
    const remainingArgs = predicate.args.filter(
      (arg) => !conditionsToRemove.some(
        (cond) => areExpressionsEqual(arg, cond)
      )
    );
    if (remainingArgs.length === 0) {
      return void 0;
    } else if (remainingArgs.length === 1) {
      return remainingArgs[0];
    } else {
      return {
        type: `func`,
        name: `and`,
        args: remainingArgs
      };
    }
  }
  return predicate;
}
function combineConditions(conditions) {
  if (conditions.length === 0) {
    return { type: `val`, value: true };
  } else if (conditions.length === 1) {
    return conditions[0];
  } else {
    const flattenedConditions = [];
    for (const condition of conditions) {
      if (condition.type === `func` && condition.name === `and`) {
        flattenedConditions.push(...condition.args);
      } else {
        flattenedConditions.push(condition);
      }
    }
    if (flattenedConditions.length === 1) {
      return flattenedConditions[0];
    } else {
      return {
        type: `func`,
        name: `and`,
        args: flattenedConditions
      };
    }
  }
}
function findPredicateWithOperator(predicates, operator, value) {
  return predicates.find((p) => {
    if (p.type === `func`) {
      const f = p;
      const field = extractComparisonField(f);
      return f.name === operator && field && areValuesEqual(field.value, value);
    }
    return false;
  });
}
function areExpressionsEqual(a, b) {
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === `val` && b.type === `val`) {
    return areValuesEqual(a.value, b.value);
  }
  if (a.type === `ref` && b.type === `ref`) {
    return areRefsEqual(a, b);
  }
  if (a.type === `func` && b.type === `func`) {
    const aFunc = a;
    const bFunc = b;
    if (aFunc.name !== bFunc.name) {
      return false;
    }
    if (aFunc.args.length !== bFunc.args.length) {
      return false;
    }
    return aFunc.args.every(
      (arg, i) => areExpressionsEqual(arg, bFunc.args[i])
    );
  }
  return false;
}
function areValuesEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (typeof a === `number` && typeof b === `number` && isNaN(a) && isNaN(b)) {
    return true;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (typeof a === `object` && typeof b === `object` && a !== null && b !== null) {
    return a === b;
  }
  return false;
}
function areRefsEqual(a, b) {
  if (a.path.length !== b.path.length) {
    return false;
  }
  return a.path.every((segment, i) => segment === b.path[i]);
}
function isPrimitive(value) {
  return value === null || value === void 0 || typeof value === `string` || typeof value === `number` || typeof value === `boolean`;
}
function areAllPrimitives(values) {
  return values.every(isPrimitive);
}
function arrayIncludesWithSet(array, value, primitiveSet, arrayIsAllPrimitives) {
  if (primitiveSet) {
    if (arrayIsAllPrimitives || isPrimitive(value)) {
      return primitiveSet.has(value);
    }
    return false;
  }
  return array.some((v) => areValuesEqual(v, value));
}
function maxValue(a, b) {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() > b.getTime() ? a : b;
  }
  return Math.max(a, b);
}
function minValue(a, b) {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() < b.getTime() ? a : b;
  }
  return Math.min(a, b);
}
function areCompareOptionsEqual(a, b) {
  return a.direction === b.direction;
}
function extractComparisonField(func) {
  if ([`eq`, `gt`, `gte`, `lt`, `lte`].includes(func.name)) {
    const firstArg = func.args[0];
    const secondArg = func.args[1];
    if (firstArg?.type === `ref` && secondArg?.type === `val`) {
      return {
        ref: firstArg,
        value: secondArg.value
      };
    }
  }
  return null;
}
function extractEqualityField(func) {
  if (func.name === `eq`) {
    const firstArg = func.args[0];
    const secondArg = func.args[1];
    if (firstArg?.type === `ref` && secondArg?.type === `val`) {
      return {
        ref: firstArg,
        value: secondArg.value
      };
    }
  }
  return null;
}
function extractInField(func) {
  if (func.name === `in`) {
    const firstArg = func.args[0];
    const secondArg = func.args[1];
    if (firstArg?.type === `ref` && secondArg?.type === `val` && Array.isArray(secondArg.value)) {
      let values = secondArg.value;
      const allPrimitives = areAllPrimitives(values);
      let primitiveSet = null;
      if (allPrimitives && values.length > 10) {
        primitiveSet = new Set(values);
        if (primitiveSet.size < values.length) {
          values = Array.from(primitiveSet);
        }
      }
      return {
        ref: firstArg,
        values,
        areAllPrimitives: allPrimitives,
        primitiveSet
      };
    }
  }
  return null;
}
function isComparisonSubset(subsetFunc, subsetValue, supersetFunc, supersetValue) {
  const subOp = subsetFunc.name;
  const superOp = supersetFunc.name;
  if (subOp === superOp) {
    if (subOp === `eq`) {
      if (isPrimitive(subsetValue) && isPrimitive(supersetValue)) {
        return subsetValue === supersetValue;
      }
      return areValuesEqual(subsetValue, supersetValue);
    } else if (subOp === `gt`) {
      return subsetValue >= supersetValue;
    } else if (subOp === `gte`) {
      return subsetValue >= supersetValue;
    } else if (subOp === `lt`) {
      return subsetValue <= supersetValue;
    } else if (subOp === `lte`) {
      return subsetValue <= supersetValue;
    }
  }
  if (subOp === `eq` && superOp === `gt`) {
    return subsetValue > supersetValue;
  }
  if (subOp === `eq` && superOp === `gte`) {
    return subsetValue >= supersetValue;
  }
  if (subOp === `eq` && superOp === `lt`) {
    return subsetValue < supersetValue;
  }
  if (subOp === `eq` && superOp === `lte`) {
    return subsetValue <= supersetValue;
  }
  if (subOp === `gt` && superOp === `gte`) {
    return subsetValue >= supersetValue;
  }
  if (subOp === `gte` && superOp === `gt`) {
    return subsetValue > supersetValue;
  }
  if (subOp === `lt` && superOp === `lte`) {
    return subsetValue <= supersetValue;
  }
  if (subOp === `lte` && superOp === `lt`) {
    return subsetValue < supersetValue;
  }
  return false;
}
function groupPredicatesByField(predicates) {
  const groups = /* @__PURE__ */ new Map();
  for (const pred of predicates) {
    let fieldKey = null;
    if (pred.type === `func`) {
      const func = pred;
      const field = extractComparisonField(func) || extractEqualityField(func) || extractInField(func);
      if (field) {
        fieldKey = field.ref.path.join(`.`);
      }
    }
    const group = groups.get(fieldKey) || [];
    group.push(pred);
    groups.set(fieldKey, group);
  }
  return groups;
}
function unionSameFieldPredicates(predicates) {
  if (predicates.length === 1) {
    return predicates[0];
  }
  let maxGt = null;
  let maxGte = null;
  let minLt = null;
  let minLte = null;
  const eqValues = /* @__PURE__ */ new Set();
  const inValues = /* @__PURE__ */ new Set();
  const otherPredicates = [];
  for (const pred of predicates) {
    if (pred.type === `func`) {
      const func = pred;
      const field = extractComparisonField(func);
      if (field) {
        const value = field.value;
        if (func.name === `gt`) {
          maxGt = maxGt === null ? value : minValue(maxGt, value);
        } else if (func.name === `gte`) {
          maxGte = maxGte === null ? value : minValue(maxGte, value);
        } else if (func.name === `lt`) {
          minLt = minLt === null ? value : maxValue(minLt, value);
        } else if (func.name === `lte`) {
          minLte = minLte === null ? value : maxValue(minLte, value);
        } else if (func.name === `eq`) {
          eqValues.add(value);
        } else {
          otherPredicates.push(pred);
        }
      } else {
        const inField = extractInField(func);
        if (inField) {
          for (const val of inField.values) {
            inValues.add(val);
          }
        } else {
          otherPredicates.push(pred);
        }
      }
    } else {
      otherPredicates.push(pred);
    }
  }
  if (eqValues.size > 1 || eqValues.size > 0 && inValues.size > 0) {
    const allValues = [...eqValues, ...inValues];
    const ref = predicates.find((p) => {
      if (p.type === `func`) {
        const field = extractComparisonField(p) || extractInField(p);
        return field !== null;
      }
      return false;
    });
    if (ref && ref.type === `func`) {
      const field = extractComparisonField(ref) || extractInField(ref);
      if (field) {
        return {
          type: `func`,
          name: `in`,
          args: [
            field.ref,
            { type: `val`, value: allValues }
          ]
        };
      }
    }
  }
  const result = [];
  if (maxGt !== null && maxGte !== null) {
    const pred = maxGte <= maxGt ? findPredicateWithOperator(predicates, `gte`, maxGte) : findPredicateWithOperator(predicates, `gt`, maxGt);
    if (pred) result.push(pred);
  } else if (maxGt !== null) {
    const pred = findPredicateWithOperator(predicates, `gt`, maxGt);
    if (pred) result.push(pred);
  } else if (maxGte !== null) {
    const pred = findPredicateWithOperator(predicates, `gte`, maxGte);
    if (pred) result.push(pred);
  }
  if (minLt !== null && minLte !== null) {
    const pred = minLte >= minLt ? findPredicateWithOperator(predicates, `lte`, minLte) : findPredicateWithOperator(predicates, `lt`, minLt);
    if (pred) result.push(pred);
  } else if (minLt !== null) {
    const pred = findPredicateWithOperator(predicates, `lt`, minLt);
    if (pred) result.push(pred);
  } else if (minLte !== null) {
    const pred = findPredicateWithOperator(predicates, `lte`, minLte);
    if (pred) result.push(pred);
  }
  if (eqValues.size === 1 && inValues.size === 0) {
    const pred = findPredicateWithOperator(predicates, `eq`, [...eqValues][0]);
    if (pred) result.push(pred);
  }
  if (eqValues.size === 0 && inValues.size > 0) {
    result.push(
      predicates.find((p) => {
        if (p.type === `func`) {
          return p.name === `in`;
        }
        return false;
      })
    );
  }
  result.push(...otherPredicates);
  if (result.length === 0) {
    return { type: `val`, value: true };
  }
  if (result.length === 1) {
    return result[0];
  }
  return {
    type: `func`,
    name: `or`,
    args: result
  };
}
export {
  isLimitSubset,
  isOffsetLimitSubset,
  isOrderBySubset,
  isPredicateSubset,
  isWhereSubset,
  minusWherePredicates,
  unionWherePredicates
};
//# sourceMappingURL=predicate-utils.js.map
