"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
function extractFieldPath(expr) {
  if (expr.type === `ref`) {
    return expr.path;
  }
  return null;
}
function extractValue(expr) {
  if (expr.type === `val`) {
    return expr.value;
  }
  return void 0;
}
function walkExpression(expr, visitor) {
  if (!expr) return;
  visitor(expr);
  if (expr.type === `func`) {
    expr.args.forEach((arg) => walkExpression(arg, visitor));
  }
}
function parseWhereExpression(expr, options) {
  if (!expr) return null;
  const { handlers, onUnknownOperator } = options;
  if (expr.type === `val`) {
    return expr.value;
  }
  if (expr.type === `ref`) {
    return expr.path;
  }
  const { name, args } = expr;
  const handler = handlers[name];
  if (!handler) {
    if (onUnknownOperator) {
      return onUnknownOperator(name, args);
    }
    throw new Error(
      `No handler provided for operator: ${name}. Available handlers: ${Object.keys(handlers).join(`, `)}`
    );
  }
  const parsedArgs = args.map((arg) => {
    if (arg.type === `ref`) {
      return arg.path;
    }
    if (arg.type === `val`) {
      return arg.value;
    }
    return parseWhereExpression(arg, options);
  });
  return handler(...parsedArgs);
}
function parseOrderByExpression(orderBy) {
  if (!orderBy || orderBy.length === 0) {
    return [];
  }
  return orderBy.map((clause) => {
    const field = extractFieldPath(clause.expression);
    if (!field) {
      throw new Error(
        `ORDER BY expression must be a field reference, got: ${clause.expression.type}`
      );
    }
    const { direction, nulls } = clause.compareOptions;
    const result = {
      field,
      direction,
      nulls
    };
    if (`stringSort` in clause.compareOptions) {
      result.stringSort = clause.compareOptions.stringSort;
    }
    if (`locale` in clause.compareOptions) {
      result.locale = clause.compareOptions.locale;
    }
    if (`localeOptions` in clause.compareOptions) {
      result.localeOptions = clause.compareOptions.localeOptions;
    }
    return result;
  });
}
function extractSimpleComparisons(expr) {
  if (!expr) return [];
  const comparisons = [];
  function extract(e) {
    if (e.type === `func`) {
      if (e.name === `and`) {
        e.args.forEach((arg) => extract(arg));
        return;
      }
      if (e.name === `not`) {
        const [arg] = e.args;
        if (!arg || arg.type !== `func`) {
          throw new Error(
            `extractSimpleComparisons requires a comparison or null check inside 'not' operator.`
          );
        }
        const nullCheckOps2 = [`isNull`, `isUndefined`];
        if (nullCheckOps2.includes(arg.name)) {
          const [fieldArg] = arg.args;
          const field = fieldArg?.type === `ref` ? fieldArg.path : null;
          if (field) {
            comparisons.push({
              field,
              operator: `not_${arg.name}`
              // No value for null/undefined checks
            });
          } else {
            throw new Error(
              `extractSimpleComparisons requires a field reference for '${arg.name}' operator.`
            );
          }
          return;
        }
        const comparisonOps2 = [`eq`, `gt`, `gte`, `lt`, `lte`, `in`];
        if (comparisonOps2.includes(arg.name)) {
          const [leftArg, rightArg] = arg.args;
          const field = leftArg?.type === `ref` ? leftArg.path : null;
          const value = rightArg?.type === `val` ? rightArg.value : null;
          if (field && value !== void 0) {
            comparisons.push({
              field,
              operator: `not_${arg.name}`,
              value
            });
          } else {
            throw new Error(
              `extractSimpleComparisons requires simple field-value comparisons. Found complex expression for 'not(${arg.name})' operator.`
            );
          }
          return;
        }
        throw new Error(
          `extractSimpleComparisons does not support 'not(${arg.name})'. NOT can only wrap comparison operators (eq, gt, gte, lt, lte, in) or null checks (isNull, isUndefined).`
        );
      }
      const unsupportedOps = [
        `or`,
        `like`,
        `ilike`,
        `upper`,
        `lower`,
        `length`,
        `concat`,
        `add`,
        `coalesce`,
        `count`,
        `avg`,
        `sum`,
        `min`,
        `max`
      ];
      if (unsupportedOps.includes(e.name)) {
        throw new Error(
          `extractSimpleComparisons does not support '${e.name}' operator. Use parseWhereExpression with custom handlers for complex expressions.`
        );
      }
      const nullCheckOps = [`isNull`, `isUndefined`];
      if (nullCheckOps.includes(e.name)) {
        const [fieldArg] = e.args;
        const field = fieldArg?.type === `ref` ? fieldArg.path : null;
        if (field) {
          comparisons.push({
            field,
            operator: e.name
            // No value for null/undefined checks
          });
        } else {
          throw new Error(
            `extractSimpleComparisons requires a field reference for '${e.name}' operator.`
          );
        }
        return;
      }
      const comparisonOps = [`eq`, `gt`, `gte`, `lt`, `lte`, `in`];
      if (comparisonOps.includes(e.name)) {
        const [leftArg, rightArg] = e.args;
        const field = leftArg?.type === `ref` ? leftArg.path : null;
        const value = rightArg?.type === `val` ? rightArg.value : null;
        if (field && value !== void 0) {
          comparisons.push({
            field,
            operator: e.name,
            value
          });
        } else {
          throw new Error(
            `extractSimpleComparisons requires simple field-value comparisons. Found complex expression for '${e.name}' operator.`
          );
        }
      } else {
        throw new Error(
          `extractSimpleComparisons encountered unknown operator: '${e.name}'`
        );
      }
    }
  }
  extract(expr);
  return comparisons;
}
function parseLoadSubsetOptions(options) {
  if (!options) {
    return { filters: [], sorts: [] };
  }
  return {
    filters: extractSimpleComparisons(options.where),
    sorts: parseOrderByExpression(options.orderBy),
    limit: options.limit
  };
}
exports.extractFieldPath = extractFieldPath;
exports.extractSimpleComparisons = extractSimpleComparisons;
exports.extractValue = extractValue;
exports.parseLoadSubsetOptions = parseLoadSubsetOptions;
exports.parseOrderByExpression = parseOrderByExpression;
exports.parseWhereExpression = parseWhereExpression;
exports.walkExpression = walkExpression;
//# sourceMappingURL=expression-helpers.cjs.map
