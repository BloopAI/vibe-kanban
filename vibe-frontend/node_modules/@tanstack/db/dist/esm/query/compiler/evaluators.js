import { UnknownExpressionTypeError, UnknownFunctionError, EmptyReferencePathError } from "../../errors.js";
import { normalizeValue, areValuesEqual } from "../../utils/comparison.js";
function isUnknown(value) {
  return value === null || value === void 0;
}
function toBooleanPredicate(result) {
  return result === true;
}
function compileExpression(expr, isSingleRow = false) {
  const compiledFn = compileExpressionInternal(expr, isSingleRow);
  return compiledFn;
}
function compileSingleRowExpression(expr) {
  const compiledFn = compileExpressionInternal(expr, true);
  return compiledFn;
}
function compileExpressionInternal(expr, isSingleRow) {
  switch (expr.type) {
    case `val`: {
      const value = expr.value;
      return () => value;
    }
    case `ref`: {
      return isSingleRow ? compileSingleRowRef(expr) : compileRef(expr);
    }
    case `func`: {
      return compileFunction(expr, isSingleRow);
    }
    default:
      throw new UnknownExpressionTypeError(expr.type);
  }
}
function compileRef(ref) {
  const [tableAlias, ...propertyPath] = ref.path;
  if (!tableAlias) {
    throw new EmptyReferencePathError();
  }
  if (propertyPath.length === 0) {
    return (namespacedRow) => namespacedRow[tableAlias];
  } else if (propertyPath.length === 1) {
    const prop = propertyPath[0];
    return (namespacedRow) => {
      const tableData = namespacedRow[tableAlias];
      return tableData?.[prop];
    };
  } else {
    return (namespacedRow) => {
      const tableData = namespacedRow[tableAlias];
      if (tableData === void 0) {
        return void 0;
      }
      let value = tableData;
      for (const prop of propertyPath) {
        if (value == null) {
          return value;
        }
        value = value[prop];
      }
      return value;
    };
  }
}
function compileSingleRowRef(ref) {
  const propertyPath = ref.path;
  return (item) => {
    let value = item;
    for (const prop of propertyPath) {
      if (value == null) {
        return value;
      }
      value = value[prop];
    }
    return value;
  };
}
function compileFunction(func, isSingleRow) {
  const compiledArgs = func.args.map(
    (arg) => compileExpressionInternal(arg, isSingleRow)
  );
  switch (func.name) {
    // Comparison operators
    case `eq`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = normalizeValue(argA(data));
        const b = normalizeValue(argB(data));
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return areValuesEqual(a, b);
      };
    }
    case `gt`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return a > b;
      };
    }
    case `gte`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return a >= b;
      };
    }
    case `lt`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return a < b;
      };
    }
    case `lte`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return a <= b;
      };
    }
    // Boolean operators
    case `and`:
      return (data) => {
        let hasUnknown = false;
        for (const compiledArg of compiledArgs) {
          const result = compiledArg(data);
          if (result === false) {
            return false;
          }
          if (isUnknown(result)) {
            hasUnknown = true;
          }
        }
        if (hasUnknown) {
          return null;
        }
        return true;
      };
    case `or`:
      return (data) => {
        let hasUnknown = false;
        for (const compiledArg of compiledArgs) {
          const result = compiledArg(data);
          if (result === true) {
            return true;
          }
          if (isUnknown(result)) {
            hasUnknown = true;
          }
        }
        if (hasUnknown) {
          return null;
        }
        return false;
      };
    case `not`: {
      const arg = compiledArgs[0];
      return (data) => {
        const result = arg(data);
        if (isUnknown(result)) {
          return null;
        }
        return !result;
      };
    }
    // Array operators
    case `in`: {
      const valueEvaluator = compiledArgs[0];
      const arrayEvaluator = compiledArgs[1];
      return (data) => {
        const value = valueEvaluator(data);
        const array = arrayEvaluator(data);
        if (isUnknown(value)) {
          return null;
        }
        if (!Array.isArray(array)) {
          return false;
        }
        return array.includes(value);
      };
    }
    // String operators
    case `like`: {
      const valueEvaluator = compiledArgs[0];
      const patternEvaluator = compiledArgs[1];
      return (data) => {
        const value = valueEvaluator(data);
        const pattern = patternEvaluator(data);
        if (isUnknown(value) || isUnknown(pattern)) {
          return null;
        }
        return evaluateLike(value, pattern, false);
      };
    }
    case `ilike`: {
      const valueEvaluator = compiledArgs[0];
      const patternEvaluator = compiledArgs[1];
      return (data) => {
        const value = valueEvaluator(data);
        const pattern = patternEvaluator(data);
        if (isUnknown(value) || isUnknown(pattern)) {
          return null;
        }
        return evaluateLike(value, pattern, true);
      };
    }
    // String functions
    case `upper`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        return typeof value === `string` ? value.toUpperCase() : value;
      };
    }
    case `lower`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        return typeof value === `string` ? value.toLowerCase() : value;
      };
    }
    case `length`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        if (typeof value === `string`) {
          return value.length;
        }
        if (Array.isArray(value)) {
          return value.length;
        }
        return 0;
      };
    }
    case `concat`:
      return (data) => {
        return compiledArgs.map((evaluator) => {
          const arg = evaluator(data);
          try {
            return String(arg ?? ``);
          } catch {
            try {
              return JSON.stringify(arg) || ``;
            } catch {
              return `[object]`;
            }
          }
        }).join(``);
      };
    case `coalesce`:
      return (data) => {
        for (const evaluator of compiledArgs) {
          const value = evaluator(data);
          if (value !== null && value !== void 0) {
            return value;
          }
        }
        return null;
      };
    // Math functions
    case `add`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        return (a ?? 0) + (b ?? 0);
      };
    }
    case `subtract`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        return (a ?? 0) - (b ?? 0);
      };
    }
    case `multiply`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        return (a ?? 0) * (b ?? 0);
      };
    }
    case `divide`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        const divisor = b ?? 0;
        return divisor !== 0 ? (a ?? 0) / divisor : null;
      };
    }
    // Null/undefined checking functions
    case `isUndefined`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        return value === void 0;
      };
    }
    case `isNull`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        return value === null;
      };
    }
    default:
      throw new UnknownFunctionError(func.name);
  }
}
function evaluateLike(value, pattern, caseInsensitive) {
  if (typeof value !== `string` || typeof pattern !== `string`) {
    return false;
  }
  const searchValue = caseInsensitive ? value.toLowerCase() : value;
  const searchPattern = caseInsensitive ? pattern.toLowerCase() : pattern;
  let regexPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`);
  regexPattern = regexPattern.replace(/%/g, `.*`);
  regexPattern = regexPattern.replace(/_/g, `.`);
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(searchValue);
}
export {
  compileExpression,
  compileSingleRowExpression,
  toBooleanPredicate
};
//# sourceMappingURL=evaluators.js.map
