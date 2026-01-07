import { map } from "@tanstack/db-ivm";
import { PropRef, isExpressionLike, Value } from "../ir.js";
import { compileExpression } from "./evaluators.js";
function unwrapVal(input) {
  if (input instanceof Value) return input.value;
  return input;
}
function processMerge(op, namespacedRow, selectResults) {
  const value = op.source(namespacedRow);
  if (value && typeof value === `object`) {
    let cursor = selectResults;
    const path = op.targetPath;
    if (path.length === 0) {
      for (const [k, v] of Object.entries(value)) {
        selectResults[k] = unwrapVal(v);
      }
    } else {
      for (let i = 0; i < path.length; i++) {
        const seg = path[i];
        if (i === path.length - 1) {
          const dest = cursor[seg] ??= {};
          if (typeof dest === `object`) {
            for (const [k, v] of Object.entries(value)) {
              dest[k] = unwrapVal(v);
            }
          }
        } else {
          const next = cursor[seg];
          if (next == null || typeof next !== `object`) {
            cursor[seg] = {};
          }
          cursor = cursor[seg];
        }
      }
    }
  }
}
function processNonMergeOp(op, namespacedRow, selectResults) {
  const path = op.alias.split(`.`);
  if (path.length === 1) {
    selectResults[op.alias] = op.compiled(namespacedRow);
  } else {
    let cursor = selectResults;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      const next = cursor[seg];
      if (next == null || typeof next !== `object`) {
        cursor[seg] = {};
      }
      cursor = cursor[seg];
    }
    cursor[path[path.length - 1]] = unwrapVal(op.compiled(namespacedRow));
  }
}
function processRow([key, namespacedRow], ops) {
  const selectResults = {};
  for (const op of ops) {
    if (op.kind === `merge`) {
      processMerge(op, namespacedRow, selectResults);
    } else {
      processNonMergeOp(op, namespacedRow, selectResults);
    }
  }
  return [
    key,
    {
      ...namespacedRow,
      __select_results: selectResults
    }
  ];
}
function processSelect(pipeline, select, _allInputs) {
  const ops = [];
  addFromObject([], select, ops);
  return pipeline.pipe(map((row) => processRow(row, ops)));
}
function isAggregateExpression(expr) {
  return expr.type === `agg`;
}
function isNestedSelectObject(obj) {
  return obj && typeof obj === `object` && !isExpressionLike(obj);
}
function addFromObject(prefixPath, obj, ops) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith(`__SPREAD_SENTINEL__`)) {
      const rest = key.slice(`__SPREAD_SENTINEL__`.length);
      const splitIndex = rest.lastIndexOf(`__`);
      const pathStr = splitIndex >= 0 ? rest.slice(0, splitIndex) : rest;
      const isRefExpr = value && typeof value === `object` && `type` in value && value.type === `ref`;
      if (pathStr.includes(`.`) || isRefExpr) {
        const targetPath = [...prefixPath];
        const expr = isRefExpr ? value : new PropRef(pathStr.split(`.`));
        const compiled = compileExpression(expr);
        ops.push({ kind: `merge`, targetPath, source: compiled });
      } else {
        const tableAlias = pathStr;
        const targetPath = [...prefixPath];
        ops.push({
          kind: `merge`,
          targetPath,
          source: (row) => row[tableAlias]
        });
      }
      continue;
    }
    const expression = value;
    if (isNestedSelectObject(expression)) {
      addFromObject([...prefixPath, key], expression, ops);
      continue;
    }
    if (isAggregateExpression(expression)) {
      ops.push({
        kind: `field`,
        alias: [...prefixPath, key].join(`.`),
        compiled: () => null
      });
    } else {
      if (expression === void 0 || !isExpressionLike(expression)) {
        ops.push({
          kind: `field`,
          alias: [...prefixPath, key].join(`.`),
          compiled: () => expression
        });
        continue;
      }
      if (expression instanceof Value) {
        const val = expression.value;
        ops.push({
          kind: `field`,
          alias: [...prefixPath, key].join(`.`),
          compiled: () => val
        });
      } else {
        ops.push({
          kind: `field`,
          alias: [...prefixPath, key].join(`.`),
          compiled: compileExpression(expression)
        });
      }
    }
  }
}
export {
  processSelect
};
//# sourceMappingURL=select.js.map
