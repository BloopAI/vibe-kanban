import { map, filter, distinct } from "@tanstack/db-ivm";
import { optimizeQuery } from "../optimizer.js";
import { DistinctRequiresSelectError, HavingRequiresGroupByError, LimitOffsetRequireOrderByError, DuplicateAliasInSubqueryError, UnsupportedFromTypeError, CollectionInputNotFoundError } from "../../errors.js";
import { getWhereExpression, Value } from "../ir.js";
import { compileExpression, toBooleanPredicate } from "./evaluators.js";
import { processJoins } from "./joins.js";
import { processGroupBy } from "./group-by.js";
import { processOrderBy } from "./order-by.js";
import { processSelect } from "./select.js";
function compileQuery(rawQuery, inputs, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, cache = /* @__PURE__ */ new WeakMap(), queryMapping = /* @__PURE__ */ new WeakMap()) {
  const cachedResult = cache.get(rawQuery);
  if (cachedResult) {
    return cachedResult;
  }
  validateQueryStructure(rawQuery);
  const { optimizedQuery: query, sourceWhereClauses } = optimizeQuery(rawQuery);
  queryMapping.set(query, rawQuery);
  mapNestedQueries(query, rawQuery, queryMapping);
  const allInputs = { ...inputs };
  const aliasToCollectionId = {};
  const aliasRemapping = {};
  const sources = {};
  const {
    alias: mainSource,
    input: mainInput,
    collectionId: mainCollectionId
  } = processFrom(
    query.from,
    allInputs,
    collections,
    subscriptions,
    callbacks,
    lazySources,
    optimizableOrderByCollections,
    setWindowFn,
    cache,
    queryMapping,
    aliasToCollectionId,
    aliasRemapping
  );
  sources[mainSource] = mainInput;
  let pipeline = mainInput.pipe(
    map(([key, row]) => {
      const ret = [key, { [mainSource]: row }];
      return ret;
    })
  );
  if (query.join && query.join.length > 0) {
    pipeline = processJoins(
      pipeline,
      query.join,
      sources,
      mainCollectionId,
      mainSource,
      allInputs,
      cache,
      queryMapping,
      collections,
      subscriptions,
      callbacks,
      lazySources,
      optimizableOrderByCollections,
      setWindowFn,
      rawQuery,
      compileQuery,
      aliasToCollectionId,
      aliasRemapping
    );
  }
  if (query.where && query.where.length > 0) {
    for (const where of query.where) {
      const whereExpression = getWhereExpression(where);
      const compiledWhere = compileExpression(whereExpression);
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return toBooleanPredicate(compiledWhere(namespacedRow));
        })
      );
    }
  }
  if (query.fnWhere && query.fnWhere.length > 0) {
    for (const fnWhere of query.fnWhere) {
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return toBooleanPredicate(fnWhere(namespacedRow));
        })
      );
    }
  }
  if (query.distinct && !query.fnSelect && !query.select) {
    throw new DistinctRequiresSelectError();
  }
  if (query.fnSelect) {
    pipeline = pipeline.pipe(
      map(([key, namespacedRow]) => {
        const selectResults = query.fnSelect(namespacedRow);
        return [
          key,
          {
            ...namespacedRow,
            __select_results: selectResults
          }
        ];
      })
    );
  } else if (query.select) {
    pipeline = processSelect(pipeline, query.select);
  } else {
    pipeline = pipeline.pipe(
      map(([key, namespacedRow]) => {
        const selectResults = !query.join && !query.groupBy ? namespacedRow[mainSource] : namespacedRow;
        return [
          key,
          {
            ...namespacedRow,
            __select_results: selectResults
          }
        ];
      })
    );
  }
  if (query.groupBy && query.groupBy.length > 0) {
    pipeline = processGroupBy(
      pipeline,
      query.groupBy,
      query.having,
      query.select,
      query.fnHaving
    );
  } else if (query.select) {
    const hasAggregates = Object.values(query.select).some(
      (expr) => expr.type === `agg`
    );
    if (hasAggregates) {
      pipeline = processGroupBy(
        pipeline,
        [],
        // Empty group by means single group
        query.having,
        query.select,
        query.fnHaving
      );
    }
  }
  if (query.having && (!query.groupBy || query.groupBy.length === 0)) {
    const hasAggregates = query.select ? Object.values(query.select).some((expr) => expr.type === `agg`) : false;
    if (!hasAggregates) {
      throw new HavingRequiresGroupByError();
    }
  }
  if (query.fnHaving && query.fnHaving.length > 0 && (!query.groupBy || query.groupBy.length === 0)) {
    for (const fnHaving of query.fnHaving) {
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return fnHaving(namespacedRow);
        })
      );
    }
  }
  if (query.distinct) {
    pipeline = pipeline.pipe(distinct(([_key, row]) => row.__select_results));
  }
  if (query.orderBy && query.orderBy.length > 0) {
    const orderedPipeline = processOrderBy(
      rawQuery,
      pipeline,
      query.orderBy,
      query.select || {},
      collections[mainCollectionId],
      optimizableOrderByCollections,
      setWindowFn,
      query.limit,
      query.offset
    );
    const resultPipeline2 = orderedPipeline.pipe(
      map(([key, [row, orderByIndex]]) => {
        const raw = row.__select_results;
        const finalResults = unwrapValue(raw);
        return [key, [finalResults, orderByIndex]];
      })
    );
    const result2 = resultPipeline2;
    const compilationResult2 = {
      collectionId: mainCollectionId,
      pipeline: result2,
      sourceWhereClauses,
      aliasToCollectionId,
      aliasRemapping
    };
    cache.set(rawQuery, compilationResult2);
    return compilationResult2;
  } else if (query.limit !== void 0 || query.offset !== void 0) {
    throw new LimitOffsetRequireOrderByError();
  }
  const resultPipeline = pipeline.pipe(
    map(([key, row]) => {
      const raw = row.__select_results;
      const finalResults = unwrapValue(raw);
      return [key, [finalResults, void 0]];
    })
  );
  const result = resultPipeline;
  const compilationResult = {
    collectionId: mainCollectionId,
    pipeline: result,
    sourceWhereClauses,
    aliasToCollectionId,
    aliasRemapping
  };
  cache.set(rawQuery, compilationResult);
  return compilationResult;
}
function collectDirectCollectionAliases(query) {
  const aliases = /* @__PURE__ */ new Set();
  if (query.from.type === `collectionRef`) {
    aliases.add(query.from.alias);
  }
  if (query.join) {
    for (const joinClause of query.join) {
      if (joinClause.from.type === `collectionRef`) {
        aliases.add(joinClause.from.alias);
      }
    }
  }
  return aliases;
}
function validateQueryStructure(query, parentCollectionAliases = /* @__PURE__ */ new Set()) {
  const currentLevelAliases = collectDirectCollectionAliases(query);
  for (const alias of currentLevelAliases) {
    if (parentCollectionAliases.has(alias)) {
      throw new DuplicateAliasInSubqueryError(
        alias,
        Array.from(parentCollectionAliases)
      );
    }
  }
  const combinedAliases = /* @__PURE__ */ new Set([
    ...parentCollectionAliases,
    ...currentLevelAliases
  ]);
  if (query.from.type === `queryRef`) {
    validateQueryStructure(query.from.query, combinedAliases);
  }
  if (query.join) {
    for (const joinClause of query.join) {
      if (joinClause.from.type === `queryRef`) {
        validateQueryStructure(joinClause.from.query, combinedAliases);
      }
    }
  }
}
function processFrom(from, allInputs, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, cache, queryMapping, aliasToCollectionId, aliasRemapping) {
  switch (from.type) {
    case `collectionRef`: {
      const input = allInputs[from.alias];
      if (!input) {
        throw new CollectionInputNotFoundError(
          from.alias,
          from.collection.id,
          Object.keys(allInputs)
        );
      }
      aliasToCollectionId[from.alias] = from.collection.id;
      return { alias: from.alias, input, collectionId: from.collection.id };
    }
    case `queryRef`: {
      const originalQuery = queryMapping.get(from.query) || from.query;
      const subQueryResult = compileQuery(
        originalQuery,
        allInputs,
        collections,
        subscriptions,
        callbacks,
        lazySources,
        optimizableOrderByCollections,
        setWindowFn,
        cache,
        queryMapping
      );
      Object.assign(aliasToCollectionId, subQueryResult.aliasToCollectionId);
      Object.assign(aliasRemapping, subQueryResult.aliasRemapping);
      const innerAlias = Object.keys(subQueryResult.aliasToCollectionId).find(
        (alias) => subQueryResult.aliasToCollectionId[alias] === subQueryResult.collectionId
      );
      if (innerAlias && innerAlias !== from.alias) {
        aliasRemapping[from.alias] = innerAlias;
      }
      const subQueryInput = subQueryResult.pipeline;
      const extractedInput = subQueryInput.pipe(
        map((data) => {
          const [key, [value, _orderByIndex]] = data;
          const unwrapped = unwrapValue(value);
          return [key, unwrapped];
        })
      );
      return {
        alias: from.alias,
        input: extractedInput,
        collectionId: subQueryResult.collectionId
      };
    }
    default:
      throw new UnsupportedFromTypeError(from.type);
  }
}
function isValue(raw) {
  return raw instanceof Value || raw && typeof raw === `object` && `type` in raw && raw.type === `val`;
}
function unwrapValue(value) {
  return isValue(value) ? value.value : value;
}
function mapNestedQueries(optimizedQuery, originalQuery, queryMapping) {
  if (optimizedQuery.from.type === `queryRef` && originalQuery.from.type === `queryRef`) {
    queryMapping.set(optimizedQuery.from.query, originalQuery.from.query);
    mapNestedQueries(
      optimizedQuery.from.query,
      originalQuery.from.query,
      queryMapping
    );
  }
  if (optimizedQuery.join && originalQuery.join) {
    for (let i = 0; i < optimizedQuery.join.length && i < originalQuery.join.length; i++) {
      const optimizedJoin = optimizedQuery.join[i];
      const originalJoin = originalQuery.join[i];
      if (optimizedJoin.from.type === `queryRef` && originalJoin.from.type === `queryRef`) {
        queryMapping.set(optimizedJoin.from.query, originalJoin.from.query);
        mapNestedQueries(
          optimizedJoin.from.query,
          originalJoin.from.query,
          queryMapping
        );
      }
    }
  }
}
export {
  compileQuery
};
//# sourceMappingURL=index.js.map
