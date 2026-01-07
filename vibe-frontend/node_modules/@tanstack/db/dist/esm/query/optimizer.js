import { deepEquals } from "../utils.js";
import { CannotCombineEmptyExpressionListError } from "../errors.js";
import { QueryRef, getWhereExpression, isResidualWhere, CollectionRef, Func, createResidualWhere, PropRef } from "./ir.js";
function optimizeQuery(query) {
  const sourceWhereClauses = extractSourceWhereClauses(query);
  let optimized = query;
  let previousOptimized;
  let iterations = 0;
  const maxIterations = 10;
  while (iterations < maxIterations && !deepEquals(optimized, previousOptimized)) {
    previousOptimized = optimized;
    optimized = applyRecursiveOptimization(optimized);
    iterations++;
  }
  const cleaned = removeRedundantSubqueries(optimized);
  return {
    optimizedQuery: cleaned,
    sourceWhereClauses
  };
}
function extractSourceWhereClauses(query) {
  const sourceWhereClauses = /* @__PURE__ */ new Map();
  if (!query.where || query.where.length === 0) {
    return sourceWhereClauses;
  }
  const splitWhereClauses = splitAndClauses(query.where);
  const analyzedClauses = splitWhereClauses.map(
    (clause) => analyzeWhereClause(clause)
  );
  const groupedClauses = groupWhereClauses(analyzedClauses);
  for (const [sourceAlias, whereClause] of groupedClauses.singleSource) {
    if (isCollectionReference(query, sourceAlias)) {
      sourceWhereClauses.set(sourceAlias, whereClause);
    }
  }
  return sourceWhereClauses;
}
function isCollectionReference(query, sourceAlias) {
  if (query.from.alias === sourceAlias) {
    return query.from.type === `collectionRef`;
  }
  if (query.join) {
    for (const joinClause of query.join) {
      if (joinClause.from.alias === sourceAlias) {
        return joinClause.from.type === `collectionRef`;
      }
    }
  }
  return false;
}
function applyRecursiveOptimization(query) {
  const subqueriesOptimized = {
    ...query,
    from: query.from.type === `queryRef` ? new QueryRef(
      applyRecursiveOptimization(query.from.query),
      query.from.alias
    ) : query.from,
    join: query.join?.map((joinClause) => ({
      ...joinClause,
      from: joinClause.from.type === `queryRef` ? new QueryRef(
        applyRecursiveOptimization(joinClause.from.query),
        joinClause.from.alias
      ) : joinClause.from
    }))
  };
  return applySingleLevelOptimization(subqueriesOptimized);
}
function applySingleLevelOptimization(query) {
  if (!query.where || query.where.length === 0) {
    return query;
  }
  if (!query.join || query.join.length === 0) {
    if (query.where.length > 1) {
      const splitWhereClauses2 = splitAndClauses(query.where);
      const combinedWhere = combineWithAnd(splitWhereClauses2);
      return {
        ...query,
        where: [combinedWhere]
      };
    }
    return query;
  }
  const nonResidualWhereClauses = query.where.filter(
    (where) => !isResidualWhere(where)
  );
  const splitWhereClauses = splitAndClauses(nonResidualWhereClauses);
  const analyzedClauses = splitWhereClauses.map(
    (clause) => analyzeWhereClause(clause)
  );
  const groupedClauses = groupWhereClauses(analyzedClauses);
  const optimizedQuery = applyOptimizations(query, groupedClauses);
  const residualWhereClauses = query.where.filter(
    (where) => isResidualWhere(where)
  );
  if (residualWhereClauses.length > 0) {
    optimizedQuery.where = [
      ...optimizedQuery.where || [],
      ...residualWhereClauses
    ];
  }
  return optimizedQuery;
}
function removeRedundantSubqueries(query) {
  return {
    ...query,
    from: removeRedundantFromClause(query.from),
    join: query.join?.map((joinClause) => ({
      ...joinClause,
      from: removeRedundantFromClause(joinClause.from)
    }))
  };
}
function removeRedundantFromClause(from) {
  if (from.type === `collectionRef`) {
    return from;
  }
  const processedQuery = removeRedundantSubqueries(from.query);
  if (isRedundantSubquery(processedQuery)) {
    const innerFrom = removeRedundantFromClause(processedQuery.from);
    if (innerFrom.type === `collectionRef`) {
      return new CollectionRef(innerFrom.collection, from.alias);
    } else {
      return new QueryRef(innerFrom.query, from.alias);
    }
  }
  return new QueryRef(processedQuery, from.alias);
}
function isRedundantSubquery(query) {
  return (!query.where || query.where.length === 0) && !query.select && (!query.groupBy || query.groupBy.length === 0) && (!query.having || query.having.length === 0) && (!query.orderBy || query.orderBy.length === 0) && (!query.join || query.join.length === 0) && query.limit === void 0 && query.offset === void 0 && !query.fnSelect && (!query.fnWhere || query.fnWhere.length === 0) && (!query.fnHaving || query.fnHaving.length === 0);
}
function splitAndClauses(whereClauses) {
  const result = [];
  for (const whereClause of whereClauses) {
    const clause = getWhereExpression(whereClause);
    result.push(...splitAndClausesRecursive(clause));
  }
  return result;
}
function splitAndClausesRecursive(clause) {
  if (clause.type === `func` && clause.name === `and`) {
    const result = [];
    for (const arg of clause.args) {
      result.push(...splitAndClausesRecursive(arg));
    }
    return result;
  } else {
    return [clause];
  }
}
function analyzeWhereClause(clause) {
  const touchedSources = /* @__PURE__ */ new Set();
  let hasNamespaceOnlyRef = false;
  function collectSources(expr) {
    switch (expr.type) {
      case `ref`:
        if (expr.path && expr.path.length > 0) {
          const firstElement = expr.path[0];
          if (firstElement) {
            touchedSources.add(firstElement);
            if (expr.path.length === 1) {
              hasNamespaceOnlyRef = true;
            }
          }
        }
        break;
      case `func`:
        if (expr.args) {
          expr.args.forEach(collectSources);
        }
        break;
      case `val`:
        break;
      case `agg`:
        if (expr.args) {
          expr.args.forEach(collectSources);
        }
        break;
    }
  }
  collectSources(clause);
  return {
    expression: clause,
    touchedSources,
    hasNamespaceOnlyRef
  };
}
function groupWhereClauses(analyzedClauses) {
  const singleSource = /* @__PURE__ */ new Map();
  const multiSource = [];
  for (const clause of analyzedClauses) {
    if (clause.touchedSources.size === 1 && !clause.hasNamespaceOnlyRef) {
      const source = Array.from(clause.touchedSources)[0];
      if (!singleSource.has(source)) {
        singleSource.set(source, []);
      }
      singleSource.get(source).push(clause.expression);
    } else if (clause.touchedSources.size > 1 || clause.hasNamespaceOnlyRef) {
      multiSource.push(clause.expression);
    }
  }
  const combinedSingleSource = /* @__PURE__ */ new Map();
  for (const [source, clauses] of singleSource) {
    combinedSingleSource.set(source, combineWithAnd(clauses));
  }
  const combinedMultiSource = multiSource.length > 0 ? combineWithAnd(multiSource) : void 0;
  return {
    singleSource: combinedSingleSource,
    multiSource: combinedMultiSource
  };
}
function applyOptimizations(query, groupedClauses) {
  const actuallyOptimized = /* @__PURE__ */ new Set();
  const optimizedFrom = optimizeFromWithTracking(
    query.from,
    groupedClauses.singleSource,
    actuallyOptimized
  );
  const optimizedJoins = query.join ? query.join.map((joinClause) => ({
    ...joinClause,
    from: optimizeFromWithTracking(
      joinClause.from,
      groupedClauses.singleSource,
      actuallyOptimized
    )
  })) : void 0;
  const remainingWhereClauses = [];
  if (groupedClauses.multiSource) {
    remainingWhereClauses.push(groupedClauses.multiSource);
  }
  const hasOuterJoins = query.join && query.join.some(
    (join) => join.type === `left` || join.type === `right` || join.type === `full`
  );
  for (const [source, clause] of groupedClauses.singleSource) {
    if (!actuallyOptimized.has(source)) {
      remainingWhereClauses.push(clause);
    } else if (hasOuterJoins) {
      remainingWhereClauses.push(createResidualWhere(clause));
    }
  }
  const finalWhere = remainingWhereClauses.length > 1 ? [
    combineWithAnd(
      remainingWhereClauses.flatMap(
        (clause) => splitAndClausesRecursive(getWhereExpression(clause))
      )
    )
  ] : remainingWhereClauses;
  const optimizedQuery = {
    // Copy all non-optimized fields as-is
    select: query.select,
    groupBy: query.groupBy ? [...query.groupBy] : void 0,
    having: query.having ? [...query.having] : void 0,
    orderBy: query.orderBy ? [...query.orderBy] : void 0,
    limit: query.limit,
    offset: query.offset,
    distinct: query.distinct,
    fnSelect: query.fnSelect,
    fnWhere: query.fnWhere ? [...query.fnWhere] : void 0,
    fnHaving: query.fnHaving ? [...query.fnHaving] : void 0,
    // Use the optimized FROM and JOIN clauses
    from: optimizedFrom,
    join: optimizedJoins,
    // Include combined WHERE clauses
    where: finalWhere.length > 0 ? finalWhere : []
  };
  return optimizedQuery;
}
function deepCopyQuery(query) {
  return {
    // Recursively copy the FROM clause
    from: query.from.type === `collectionRef` ? new CollectionRef(query.from.collection, query.from.alias) : new QueryRef(deepCopyQuery(query.from.query), query.from.alias),
    // Copy all other fields, creating new arrays where necessary
    select: query.select,
    join: query.join ? query.join.map((joinClause) => ({
      type: joinClause.type,
      left: joinClause.left,
      right: joinClause.right,
      from: joinClause.from.type === `collectionRef` ? new CollectionRef(
        joinClause.from.collection,
        joinClause.from.alias
      ) : new QueryRef(
        deepCopyQuery(joinClause.from.query),
        joinClause.from.alias
      )
    })) : void 0,
    where: query.where ? [...query.where] : void 0,
    groupBy: query.groupBy ? [...query.groupBy] : void 0,
    having: query.having ? [...query.having] : void 0,
    orderBy: query.orderBy ? [...query.orderBy] : void 0,
    limit: query.limit,
    offset: query.offset,
    fnSelect: query.fnSelect,
    fnWhere: query.fnWhere ? [...query.fnWhere] : void 0,
    fnHaving: query.fnHaving ? [...query.fnHaving] : void 0
  };
}
function optimizeFromWithTracking(from, singleSourceClauses, actuallyOptimized) {
  const whereClause = singleSourceClauses.get(from.alias);
  if (!whereClause) {
    if (from.type === `collectionRef`) {
      return new CollectionRef(from.collection, from.alias);
    }
    return new QueryRef(deepCopyQuery(from.query), from.alias);
  }
  if (from.type === `collectionRef`) {
    const subQuery = {
      from: new CollectionRef(from.collection, from.alias),
      where: [whereClause]
    };
    actuallyOptimized.add(from.alias);
    return new QueryRef(subQuery, from.alias);
  }
  if (!isSafeToPushIntoExistingSubquery(from.query, whereClause, from.alias)) {
    return new QueryRef(deepCopyQuery(from.query), from.alias);
  }
  if (referencesAliasWithRemappedSelect(from.query, whereClause, from.alias)) {
    return new QueryRef(deepCopyQuery(from.query), from.alias);
  }
  const existingWhere = from.query.where || [];
  const optimizedSubQuery = {
    ...deepCopyQuery(from.query),
    where: [...existingWhere, whereClause]
  };
  actuallyOptimized.add(from.alias);
  return new QueryRef(optimizedSubQuery, from.alias);
}
function unsafeSelect(query, whereClause, outerAlias) {
  if (!query.select) return false;
  return selectHasAggregates(query.select) || whereReferencesComputedSelectFields(query.select, whereClause, outerAlias);
}
function unsafeGroupBy(query) {
  return query.groupBy && query.groupBy.length > 0;
}
function unsafeHaving(query) {
  return query.having && query.having.length > 0;
}
function unsafeOrderBy(query) {
  return query.orderBy && query.orderBy.length > 0 && (query.limit !== void 0 || query.offset !== void 0);
}
function unsafeFnSelect(query) {
  return query.fnSelect || query.fnWhere && query.fnWhere.length > 0 || query.fnHaving && query.fnHaving.length > 0;
}
function isSafeToPushIntoExistingSubquery(query, whereClause, outerAlias) {
  return !(unsafeSelect(query, whereClause, outerAlias) || unsafeGroupBy(query) || unsafeHaving(query) || unsafeOrderBy(query) || unsafeFnSelect(query));
}
function selectHasAggregates(select) {
  for (const value of Object.values(select)) {
    if (typeof value === `object`) {
      const v = value;
      if (v.type === `agg`) return true;
      if (!(`type` in v)) {
        if (selectHasAggregates(v)) return true;
      }
    }
  }
  return false;
}
function collectRefs(expr) {
  const refs = [];
  if (expr == null || typeof expr !== `object`) return refs;
  switch (expr.type) {
    case `ref`:
      refs.push(expr);
      break;
    case `func`:
    case `agg`:
      for (const arg of expr.args ?? []) {
        refs.push(...collectRefs(arg));
      }
      break;
  }
  return refs;
}
function whereReferencesComputedSelectFields(select, whereClause, outerAlias) {
  const computed = /* @__PURE__ */ new Set();
  for (const [key, value] of Object.entries(select)) {
    if (key.startsWith(`__SPREAD_SENTINEL__`)) continue;
    if (value instanceof PropRef) continue;
    computed.add(key);
  }
  const refs = collectRefs(whereClause);
  for (const ref of refs) {
    const path = ref.path;
    if (!Array.isArray(path) || path.length < 2) continue;
    const alias = path[0];
    const field = path[1];
    if (alias !== outerAlias) continue;
    if (computed.has(field)) return true;
  }
  return false;
}
function referencesAliasWithRemappedSelect(subquery, whereClause, outerAlias) {
  const refs = collectRefs(whereClause);
  if (refs.every((ref) => ref.path[0] !== outerAlias)) {
    return false;
  }
  if (subquery.fnSelect) {
    return true;
  }
  const select = subquery.select;
  if (!select) {
    return false;
  }
  for (const ref of refs) {
    const path = ref.path;
    if (path.length < 2) continue;
    if (path[0] !== outerAlias) continue;
    const projected = select[path[1]];
    if (!projected) continue;
    if (!(projected instanceof PropRef)) {
      return true;
    }
    if (projected.path.length < 2) {
      return true;
    }
    const [innerAlias, innerField] = projected.path;
    if (innerAlias !== outerAlias && innerAlias !== subquery.from.alias) {
      return true;
    }
    if (innerField !== path[1]) {
      return true;
    }
  }
  return false;
}
function combineWithAnd(expressions) {
  if (expressions.length === 0) {
    throw new CannotCombineEmptyExpressionListError();
  }
  if (expressions.length === 1) {
    return expressions[0];
  }
  return new Func(`and`, expressions);
}
export {
  optimizeQuery
};
//# sourceMappingURL=optimizer.js.map
