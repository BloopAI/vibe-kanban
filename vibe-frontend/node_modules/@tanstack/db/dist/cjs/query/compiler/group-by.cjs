"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const dbIvm = require("@tanstack/db-ivm");
const ir = require("../ir.cjs");
const errors = require("../../errors.cjs");
const evaluators = require("./evaluators.cjs");
const { sum, count, avg, min, max } = dbIvm.groupByOperators;
function validateAndCreateMapping(groupByClause, selectClause) {
  const selectToGroupByIndex = /* @__PURE__ */ new Map();
  const groupByExpressions = [...groupByClause];
  if (!selectClause) {
    return { selectToGroupByIndex, groupByExpressions };
  }
  for (const [alias, expr] of Object.entries(selectClause)) {
    if (expr.type === `agg`) {
      continue;
    }
    const groupIndex = groupByExpressions.findIndex(
      (groupExpr) => expressionsEqual(expr, groupExpr)
    );
    if (groupIndex === -1) {
      throw new errors.NonAggregateExpressionNotInGroupByError(alias);
    }
    selectToGroupByIndex.set(alias, groupIndex);
  }
  return { selectToGroupByIndex, groupByExpressions };
}
function processGroupBy(pipeline, groupByClause, havingClauses, selectClause, fnHavingClauses) {
  if (groupByClause.length === 0) {
    const aggregates2 = {};
    if (selectClause) {
      for (const [alias, expr] of Object.entries(selectClause)) {
        if (expr.type === `agg`) {
          const aggExpr = expr;
          aggregates2[alias] = getAggregateFunction(aggExpr);
        }
      }
    }
    const keyExtractor2 = () => ({ __singleGroup: true });
    pipeline = pipeline.pipe(
      dbIvm.groupBy(keyExtractor2, aggregates2)
    );
    pipeline = pipeline.pipe(
      dbIvm.map(([, aggregatedRow]) => {
        const selectResults = aggregatedRow.__select_results || {};
        const finalResults = { ...selectResults };
        if (selectClause) {
          for (const [alias, expr] of Object.entries(selectClause)) {
            if (expr.type === `agg`) {
              finalResults[alias] = aggregatedRow[alias];
            }
          }
        }
        return [
          `single_group`,
          {
            ...aggregatedRow,
            __select_results: finalResults
          }
        ];
      })
    );
    if (havingClauses && havingClauses.length > 0) {
      for (const havingClause of havingClauses) {
        const havingExpression = ir.getHavingExpression(havingClause);
        const transformedHavingClause = replaceAggregatesByRefs(
          havingExpression,
          selectClause || {}
        );
        const compiledHaving = evaluators.compileExpression(transformedHavingClause);
        pipeline = pipeline.pipe(
          dbIvm.filter(([, row]) => {
            const namespacedRow = { result: row.__select_results };
            return evaluators.toBooleanPredicate(compiledHaving(namespacedRow));
          })
        );
      }
    }
    if (fnHavingClauses && fnHavingClauses.length > 0) {
      for (const fnHaving of fnHavingClauses) {
        pipeline = pipeline.pipe(
          dbIvm.filter(([, row]) => {
            const namespacedRow = { result: row.__select_results };
            return evaluators.toBooleanPredicate(fnHaving(namespacedRow));
          })
        );
      }
    }
    return pipeline;
  }
  const mapping = validateAndCreateMapping(groupByClause, selectClause);
  const compiledGroupByExpressions = groupByClause.map(
    (e) => evaluators.compileExpression(e)
  );
  const keyExtractor = ([, row]) => {
    const namespacedRow = { ...row };
    delete namespacedRow.__select_results;
    const key = {};
    for (let i = 0; i < groupByClause.length; i++) {
      const compiledExpr = compiledGroupByExpressions[i];
      const value = compiledExpr(namespacedRow);
      key[`__key_${i}`] = value;
    }
    return key;
  };
  const aggregates = {};
  if (selectClause) {
    for (const [alias, expr] of Object.entries(selectClause)) {
      if (expr.type === `agg`) {
        const aggExpr = expr;
        aggregates[alias] = getAggregateFunction(aggExpr);
      }
    }
  }
  pipeline = pipeline.pipe(dbIvm.groupBy(keyExtractor, aggregates));
  pipeline = pipeline.pipe(
    dbIvm.map(([, aggregatedRow]) => {
      const selectResults = aggregatedRow.__select_results || {};
      const finalResults = {};
      if (selectClause) {
        for (const [alias, expr] of Object.entries(selectClause)) {
          if (expr.type !== `agg`) {
            const groupIndex = mapping.selectToGroupByIndex.get(alias);
            if (groupIndex !== void 0) {
              finalResults[alias] = aggregatedRow[`__key_${groupIndex}`];
            } else {
              finalResults[alias] = selectResults[alias];
            }
          } else {
            finalResults[alias] = aggregatedRow[alias];
          }
        }
      } else {
        for (let i = 0; i < groupByClause.length; i++) {
          finalResults[`__key_${i}`] = aggregatedRow[`__key_${i}`];
        }
      }
      let finalKey;
      if (groupByClause.length === 1) {
        finalKey = aggregatedRow[`__key_0`];
      } else {
        const keyParts = [];
        for (let i = 0; i < groupByClause.length; i++) {
          keyParts.push(aggregatedRow[`__key_${i}`]);
        }
        finalKey = JSON.stringify(keyParts);
      }
      return [
        finalKey,
        {
          ...aggregatedRow,
          __select_results: finalResults
        }
      ];
    })
  );
  if (havingClauses && havingClauses.length > 0) {
    for (const havingClause of havingClauses) {
      const havingExpression = ir.getHavingExpression(havingClause);
      const transformedHavingClause = replaceAggregatesByRefs(
        havingExpression,
        selectClause || {}
      );
      const compiledHaving = evaluators.compileExpression(transformedHavingClause);
      pipeline = pipeline.pipe(
        dbIvm.filter(([, row]) => {
          const namespacedRow = { result: row.__select_results };
          return compiledHaving(namespacedRow);
        })
      );
    }
  }
  if (fnHavingClauses && fnHavingClauses.length > 0) {
    for (const fnHaving of fnHavingClauses) {
      pipeline = pipeline.pipe(
        dbIvm.filter(([, row]) => {
          const namespacedRow = { result: row.__select_results };
          return evaluators.toBooleanPredicate(fnHaving(namespacedRow));
        })
      );
    }
  }
  return pipeline;
}
function expressionsEqual(expr1, expr2) {
  if (!expr1 || !expr2) return false;
  if (expr1.type !== expr2.type) return false;
  switch (expr1.type) {
    case `ref`:
      if (!expr1.path || !expr2.path) return false;
      if (expr1.path.length !== expr2.path.length) return false;
      return expr1.path.every(
        (segment, i) => segment === expr2.path[i]
      );
    case `val`:
      return expr1.value === expr2.value;
    case `func`:
      return expr1.name === expr2.name && expr1.args?.length === expr2.args?.length && (expr1.args || []).every(
        (arg, i) => expressionsEqual(arg, expr2.args[i])
      );
    case `agg`:
      return expr1.name === expr2.name && expr1.args?.length === expr2.args?.length && (expr1.args || []).every(
        (arg, i) => expressionsEqual(arg, expr2.args[i])
      );
    default:
      return false;
  }
}
function getAggregateFunction(aggExpr) {
  const compiledExpr = evaluators.compileExpression(aggExpr.args[0]);
  const valueExtractor = ([, namespacedRow]) => {
    const value = compiledExpr(namespacedRow);
    return typeof value === `number` ? value : value != null ? Number(value) : 0;
  };
  const valueExtractorWithDate = ([, namespacedRow]) => {
    const value = compiledExpr(namespacedRow);
    return typeof value === `number` || value instanceof Date ? value : value != null ? Number(value) : 0;
  };
  const rawValueExtractor = ([, namespacedRow]) => {
    return compiledExpr(namespacedRow);
  };
  switch (aggExpr.name.toLowerCase()) {
    case `sum`:
      return sum(valueExtractor);
    case `count`:
      return count(rawValueExtractor);
    case `avg`:
      return avg(valueExtractor);
    case `min`:
      return min(valueExtractorWithDate);
    case `max`:
      return max(valueExtractorWithDate);
    default:
      throw new errors.UnsupportedAggregateFunctionError(aggExpr.name);
  }
}
function replaceAggregatesByRefs(havingExpr, selectClause, resultAlias = `result`) {
  switch (havingExpr.type) {
    case `agg`: {
      const aggExpr = havingExpr;
      for (const [alias, selectExpr] of Object.entries(selectClause)) {
        if (selectExpr.type === `agg` && aggregatesEqual(aggExpr, selectExpr)) {
          return new ir.PropRef([resultAlias, alias]);
        }
      }
      throw new errors.AggregateFunctionNotInSelectError(aggExpr.name);
    }
    case `func`: {
      const funcExpr = havingExpr;
      const transformedArgs = funcExpr.args.map(
        (arg) => replaceAggregatesByRefs(arg, selectClause)
      );
      return new ir.Func(funcExpr.name, transformedArgs);
    }
    case `ref`: {
      return havingExpr;
    }
    case `val`:
      return havingExpr;
    default:
      throw new errors.UnknownHavingExpressionTypeError(havingExpr.type);
  }
}
function aggregatesEqual(agg1, agg2) {
  return agg1.name === agg2.name && agg1.args.length === agg2.args.length && agg1.args.every((arg, i) => expressionsEqual(arg, agg2.args[i]));
}
exports.processGroupBy = processGroupBy;
exports.replaceAggregatesByRefs = replaceAggregatesByRefs;
//# sourceMappingURL=group-by.cjs.map
