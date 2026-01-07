"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const react = require("react");
const useLiveQuery = require("./useLiveQuery.cjs");
function useLiveSuspenseQuery(configOrQueryOrCollection, deps = []) {
  const promiseRef = react.useRef(null);
  const collectionRef = react.useRef(null);
  const hasBeenReadyRef = react.useRef(false);
  const result = useLiveQuery.useLiveQuery(configOrQueryOrCollection, deps);
  if (collectionRef.current !== result.collection) {
    promiseRef.current = null;
    collectionRef.current = result.collection;
    hasBeenReadyRef.current = false;
  }
  if (result.status === `ready`) {
    hasBeenReadyRef.current = true;
    promiseRef.current = null;
  }
  if (!result.isEnabled) {
    throw new Error(
      `useLiveSuspenseQuery does not support disabled queries. Use useLiveQuery instead for conditional queries.`
    );
  }
  if (result.status === `error` && !hasBeenReadyRef.current) {
    promiseRef.current = null;
    throw new Error(`Collection "${result.collection.id}" failed to load`);
  }
  if (result.status === `loading` || result.status === `idle`) {
    if (!promiseRef.current) {
      promiseRef.current = result.collection.preload();
    }
    throw promiseRef.current;
  }
  return {
    state: result.state,
    data: result.data,
    collection: result.collection
  };
}
exports.useLiveSuspenseQuery = useLiveSuspenseQuery;
//# sourceMappingURL=useLiveSuspenseQuery.cjs.map
