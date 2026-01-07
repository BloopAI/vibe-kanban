import { useRef } from "react";
import { useLiveQuery } from "./useLiveQuery.js";
function useLiveSuspenseQuery(configOrQueryOrCollection, deps = []) {
  const promiseRef = useRef(null);
  const collectionRef = useRef(null);
  const hasBeenReadyRef = useRef(false);
  const result = useLiveQuery(configOrQueryOrCollection, deps);
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
export {
  useLiveSuspenseQuery
};
//# sourceMappingURL=useLiveSuspenseQuery.js.map
