import { DEFAULT_COMPARE_OPTIONS } from "../utils.js";
import { BTreeIndex } from "./btree-index.js";
function shouldAutoIndex(collection) {
  if (collection.config.autoIndex !== `eager`) {
    return false;
  }
  return true;
}
function ensureIndexForField(fieldName, fieldPath, collection, compareOptions, compareFn) {
  if (!shouldAutoIndex(collection)) {
    return;
  }
  const compareOpts = compareOptions ?? {
    ...DEFAULT_COMPARE_OPTIONS,
    ...collection.compareOptions
  };
  const existingIndex = Array.from(collection.indexes.values()).find(
    (index) => index.matchesField(fieldPath) && index.matchesCompareOptions(compareOpts)
  );
  if (existingIndex) {
    return;
  }
  try {
    collection.createIndex(
      (row) => {
        let current = row;
        for (const part of fieldPath) {
          current = current[part];
        }
        return current;
      },
      {
        name: `auto:${fieldPath.join(`.`)}`,
        indexType: BTreeIndex,
        options: compareFn ? { compareFn, compareOptions: compareOpts } : {}
      }
    );
  } catch (error) {
    console.warn(
      `${collection.id ? `[${collection.id}] ` : ``}Failed to create auto-index for field path "${fieldPath.join(`.`)}":`,
      error
    );
  }
}
function ensureIndexForExpression(expression, collection) {
  if (!shouldAutoIndex(collection)) {
    return;
  }
  const indexableExpressions = extractIndexableExpressions(expression);
  for (const { fieldName, fieldPath } of indexableExpressions) {
    ensureIndexForField(fieldName, fieldPath, collection);
  }
}
function extractIndexableExpressions(expression) {
  const results = [];
  function extractFromExpression(expr) {
    if (expr.type !== `func`) {
      return;
    }
    const func = expr;
    if (func.name === `and`) {
      for (const arg of func.args) {
        extractFromExpression(arg);
      }
      return;
    }
    const supportedOperations = [`eq`, `gt`, `gte`, `lt`, `lte`, `in`];
    if (!supportedOperations.includes(func.name)) {
      return;
    }
    if (func.args.length < 1 || func.args[0].type !== `ref`) {
      return;
    }
    const fieldRef = func.args[0];
    const fieldPath = fieldRef.path;
    if (fieldPath.length === 0) {
      return;
    }
    const fieldName = fieldPath.join(`_`);
    results.push({ fieldName, fieldPath });
  }
  extractFromExpression(expression);
  return results;
}
export {
  ensureIndexForExpression,
  ensureIndexForField
};
//# sourceMappingURL=auto-index.js.map
