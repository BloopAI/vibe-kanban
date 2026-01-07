import { map, tap, join, filter } from "@tanstack/db-ivm";
import { JoinCollectionNotFoundError, UnsupportedJoinTypeError, SubscriptionNotFoundError, UnsupportedJoinSourceTypeError, CollectionInputNotFoundError, InvalidJoinConditionSourceMismatchError, InvalidJoinConditionSameSourceError, InvalidJoinConditionLeftSourceError, InvalidJoinConditionRightSourceError, InvalidJoinCondition } from "../../errors.js";
import { ensureIndexForField } from "../../indexes/auto-index.js";
import { followRef, PropRef } from "../ir.js";
import { inArray } from "../builder/functions.js";
import { compileExpression } from "./evaluators.js";
function processJoins(pipeline, joinClauses, sources, mainCollectionId, mainSource, allInputs, cache, queryMapping, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, rawQuery, onCompileSubquery, aliasToCollectionId, aliasRemapping) {
  let resultPipeline = pipeline;
  for (const joinClause of joinClauses) {
    resultPipeline = processJoin(
      resultPipeline,
      joinClause,
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
      onCompileSubquery,
      aliasToCollectionId,
      aliasRemapping
    );
  }
  return resultPipeline;
}
function processJoin(pipeline, joinClause, sources, mainCollectionId, mainSource, allInputs, cache, queryMapping, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, rawQuery, onCompileSubquery, aliasToCollectionId, aliasRemapping) {
  const isCollectionRef = joinClause.from.type === `collectionRef`;
  const {
    alias: joinedSource,
    input: joinedInput,
    collectionId: joinedCollectionId
  } = processJoinSource(
    joinClause.from,
    allInputs,
    collections,
    subscriptions,
    callbacks,
    lazySources,
    optimizableOrderByCollections,
    setWindowFn,
    cache,
    queryMapping,
    onCompileSubquery,
    aliasToCollectionId,
    aliasRemapping
  );
  sources[joinedSource] = joinedInput;
  if (isCollectionRef) {
    aliasToCollectionId[joinedSource] = joinedCollectionId;
  }
  const mainCollection = collections[mainCollectionId];
  const joinedCollection = collections[joinedCollectionId];
  if (!mainCollection) {
    throw new JoinCollectionNotFoundError(mainCollectionId);
  }
  if (!joinedCollection) {
    throw new JoinCollectionNotFoundError(joinedCollectionId);
  }
  const { activeSource, lazySource } = getActiveAndLazySources(
    joinClause.type,
    mainCollection,
    joinedCollection
  );
  const availableSources = Object.keys(sources);
  const { mainExpr, joinedExpr } = analyzeJoinExpressions(
    joinClause.left,
    joinClause.right,
    availableSources,
    joinedSource
  );
  const compiledMainExpr = compileExpression(mainExpr);
  const compiledJoinedExpr = compileExpression(joinedExpr);
  let mainPipeline = pipeline.pipe(
    map(([currentKey, namespacedRow]) => {
      const mainKey = compiledMainExpr(namespacedRow);
      return [mainKey, [currentKey, namespacedRow]];
    })
  );
  let joinedPipeline = joinedInput.pipe(
    map(([currentKey, row]) => {
      const namespacedRow = { [joinedSource]: row };
      const joinedKey = compiledJoinedExpr(namespacedRow);
      return [joinedKey, [currentKey, namespacedRow]];
    })
  );
  if (![`inner`, `left`, `right`, `full`].includes(joinClause.type)) {
    throw new UnsupportedJoinTypeError(joinClause.type);
  }
  if (activeSource) {
    const lazyFrom = activeSource === `main` ? joinClause.from : rawQuery.from;
    const limitedSubquery = lazyFrom.type === `queryRef` && (lazyFrom.query.limit || lazyFrom.query.offset);
    const hasComputedJoinExpr = mainExpr.type === `func` || joinedExpr.type === `func`;
    if (!limitedSubquery && !hasComputedJoinExpr) {
      const lazyAlias = activeSource === `main` ? joinedSource : mainSource;
      lazySources.add(lazyAlias);
      const activePipeline = activeSource === `main` ? mainPipeline : joinedPipeline;
      const lazySourceJoinExpr = activeSource === `main` ? joinedExpr : mainExpr;
      const followRefResult = followRef(
        rawQuery,
        lazySourceJoinExpr,
        lazySource
      );
      const followRefCollection = followRefResult.collection;
      const fieldName = followRefResult.path[0];
      if (fieldName) {
        ensureIndexForField(
          fieldName,
          followRefResult.path,
          followRefCollection
        );
      }
      const activePipelineWithLoading = activePipeline.pipe(
        tap((data) => {
          const resolvedAlias = aliasRemapping[lazyAlias] || lazyAlias;
          const lazySourceSubscription = subscriptions[resolvedAlias];
          if (!lazySourceSubscription) {
            throw new SubscriptionNotFoundError(
              resolvedAlias,
              lazyAlias,
              lazySource.id,
              Object.keys(subscriptions)
            );
          }
          if (lazySourceSubscription.hasLoadedInitialState()) {
            return;
          }
          const joinKeys = data.getInner().map(([[joinKey]]) => joinKey);
          const lazyJoinRef = new PropRef(followRefResult.path);
          const loaded = lazySourceSubscription.requestSnapshot({
            where: inArray(lazyJoinRef, joinKeys),
            optimizedOnly: true
          });
          if (!loaded) {
            lazySourceSubscription.requestSnapshot();
          }
        })
      );
      if (activeSource === `main`) {
        mainPipeline = activePipelineWithLoading;
      } else {
        joinedPipeline = activePipelineWithLoading;
      }
    }
  }
  return mainPipeline.pipe(
    join(joinedPipeline, joinClause.type),
    processJoinResults(joinClause.type)
  );
}
function analyzeJoinExpressions(left, right, allAvailableSourceAliases, joinedSource) {
  const availableSources = allAvailableSourceAliases.filter(
    (alias) => alias !== joinedSource
  );
  const leftSourceAlias = getSourceAliasFromExpression(left);
  const rightSourceAlias = getSourceAliasFromExpression(right);
  if (leftSourceAlias && availableSources.includes(leftSourceAlias) && rightSourceAlias === joinedSource) {
    return { mainExpr: left, joinedExpr: right };
  }
  if (leftSourceAlias === joinedSource && rightSourceAlias && availableSources.includes(rightSourceAlias)) {
    return { mainExpr: right, joinedExpr: left };
  }
  if (!leftSourceAlias || !rightSourceAlias) {
    throw new InvalidJoinConditionSourceMismatchError();
  }
  if (leftSourceAlias === rightSourceAlias) {
    throw new InvalidJoinConditionSameSourceError(leftSourceAlias);
  }
  if (!availableSources.includes(leftSourceAlias)) {
    throw new InvalidJoinConditionLeftSourceError(leftSourceAlias);
  }
  if (rightSourceAlias !== joinedSource) {
    throw new InvalidJoinConditionRightSourceError(joinedSource);
  }
  throw new InvalidJoinCondition();
}
function getSourceAliasFromExpression(expr) {
  switch (expr.type) {
    case `ref`:
      return expr.path[0] || null;
    case `func`: {
      const sourceAliases = /* @__PURE__ */ new Set();
      for (const arg of expr.args) {
        const alias = getSourceAliasFromExpression(arg);
        if (alias) {
          sourceAliases.add(alias);
        }
      }
      return sourceAliases.size === 1 ? Array.from(sourceAliases)[0] : null;
    }
    default:
      return null;
  }
}
function processJoinSource(from, allInputs, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, cache, queryMapping, onCompileSubquery, aliasToCollectionId, aliasRemapping) {
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
      const subQueryResult = onCompileSubquery(
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
          return [key, value];
        })
      );
      return {
        alias: from.alias,
        input: extractedInput,
        collectionId: subQueryResult.collectionId
      };
    }
    default:
      throw new UnsupportedJoinSourceTypeError(from.type);
  }
}
function processJoinResults(joinType) {
  return function(pipeline) {
    return pipeline.pipe(
      // Process the join result and handle nulls
      filter((result) => {
        const [_key, [main, joined]] = result;
        const mainNamespacedRow = main?.[1];
        const joinedNamespacedRow = joined?.[1];
        if (joinType === `inner`) {
          return !!(mainNamespacedRow && joinedNamespacedRow);
        }
        if (joinType === `left`) {
          return !!mainNamespacedRow;
        }
        if (joinType === `right`) {
          return !!joinedNamespacedRow;
        }
        return true;
      }),
      map((result) => {
        const [_key, [main, joined]] = result;
        const mainKey = main?.[0];
        const mainNamespacedRow = main?.[1];
        const joinedKey = joined?.[0];
        const joinedNamespacedRow = joined?.[1];
        const mergedNamespacedRow = {};
        if (mainNamespacedRow) {
          Object.assign(mergedNamespacedRow, mainNamespacedRow);
        }
        if (joinedNamespacedRow) {
          Object.assign(mergedNamespacedRow, joinedNamespacedRow);
        }
        const resultKey = `[${mainKey},${joinedKey}]`;
        return [resultKey, mergedNamespacedRow];
      })
    );
  };
}
function getActiveAndLazySources(joinType, leftCollection, rightCollection) {
  switch (joinType) {
    case `left`:
      return { activeSource: `main`, lazySource: rightCollection };
    case `right`:
      return { activeSource: `joined`, lazySource: leftCollection };
    case `inner`:
      return leftCollection.size < rightCollection.size ? { activeSource: `main`, lazySource: rightCollection } : { activeSource: `joined`, lazySource: leftCollection };
    default:
      return { activeSource: void 0, lazySource: void 0 };
  }
}
export {
  processJoins
};
//# sourceMappingURL=joins.js.map
