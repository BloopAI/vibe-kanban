import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { CollectionImpl } from "@tanstack/db";
import { useLiveQuery } from "./useLiveQuery.js";
function isLiveQueryCollectionUtils(utils) {
  return typeof utils.setWindow === `function`;
}
function useLiveInfiniteQuery(queryFnOrCollection, config, deps = []) {
  const pageSize = config.pageSize || 20;
  const initialPageParam = config.initialPageParam ?? 0;
  const isCollection = queryFnOrCollection instanceof CollectionImpl;
  if (!isCollection && typeof queryFnOrCollection !== `function`) {
    throw new Error(
      `useLiveInfiniteQuery: First argument must be either a pre-created live query collection (CollectionImpl) or a query function. Received: ${typeof queryFnOrCollection}`
    );
  }
  const [loadedPageCount, setLoadedPageCount] = useState(1);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const collectionRef = useRef(isCollection ? queryFnOrCollection : null);
  const hasValidatedCollectionRef = useRef(false);
  const depsKey = JSON.stringify(deps);
  const prevDepsKeyRef = useRef(depsKey);
  useEffect(() => {
    let shouldReset = false;
    if (isCollection) {
      if (collectionRef.current !== queryFnOrCollection) {
        collectionRef.current = queryFnOrCollection;
        hasValidatedCollectionRef.current = false;
        shouldReset = true;
      }
    } else {
      if (prevDepsKeyRef.current !== depsKey) {
        prevDepsKeyRef.current = depsKey;
        shouldReset = true;
      }
    }
    if (shouldReset) {
      setLoadedPageCount(1);
    }
  }, [isCollection, queryFnOrCollection, depsKey]);
  const queryResult = isCollection ? useLiveQuery(queryFnOrCollection) : useLiveQuery(
    (q) => queryFnOrCollection(q).limit(pageSize).offset(0),
    deps
  );
  useEffect(() => {
    const utils = queryResult.collection.utils;
    const expectedOffset = 0;
    const expectedLimit = loadedPageCount * pageSize + 1;
    if (!isLiveQueryCollectionUtils(utils)) {
      if (isCollection) {
        throw new Error(
          `useLiveInfiniteQuery: Pre-created live query collection must have an orderBy clause for infinite pagination to work. Please add .orderBy() to your createLiveQueryCollection query.`
        );
      }
      return;
    }
    if (isCollection && !hasValidatedCollectionRef.current) {
      const currentWindow = utils.getWindow();
      if (currentWindow && (currentWindow.offset !== expectedOffset || currentWindow.limit !== expectedLimit)) {
        console.warn(
          `useLiveInfiniteQuery: Pre-created collection has window {offset: ${currentWindow.offset}, limit: ${currentWindow.limit}} but hook expects {offset: ${expectedOffset}, limit: ${expectedLimit}}. Adjusting window now.`
        );
      }
      hasValidatedCollectionRef.current = true;
    }
    if (!isCollection && !queryResult.isReady) return;
    const result = utils.setWindow({
      offset: expectedOffset,
      limit: expectedLimit
    });
    if (result !== true) {
      setIsFetchingNextPage(true);
      result.then(() => {
        setIsFetchingNextPage(false);
      });
    } else {
      setIsFetchingNextPage(false);
    }
  }, [
    isCollection,
    queryResult.collection,
    queryResult.isReady,
    loadedPageCount,
    pageSize
  ]);
  const { pages, pageParams, hasNextPage, flatData } = useMemo(() => {
    const dataArray = Array.isArray(queryResult.data) ? queryResult.data : [];
    const totalItemsRequested = loadedPageCount * pageSize;
    const hasMore = dataArray.length > totalItemsRequested;
    const pagesResult = [];
    const pageParamsResult = [];
    for (let i = 0; i < loadedPageCount; i++) {
      const pageData = dataArray.slice(i * pageSize, (i + 1) * pageSize);
      pagesResult.push(pageData);
      pageParamsResult.push(initialPageParam + i);
    }
    const flatDataResult = dataArray.slice(
      0,
      totalItemsRequested
    );
    return {
      pages: pagesResult,
      pageParams: pageParamsResult,
      hasNextPage: hasMore,
      flatData: flatDataResult
    };
  }, [queryResult.data, loadedPageCount, pageSize, initialPageParam]);
  const fetchNextPage = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    setLoadedPageCount((prev) => prev + 1);
  }, [hasNextPage, isFetchingNextPage]);
  return {
    ...queryResult,
    data: flatData,
    pages,
    pageParams,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  };
}
export {
  useLiveInfiniteQuery
};
//# sourceMappingURL=useLiveInfiniteQuery.js.map
