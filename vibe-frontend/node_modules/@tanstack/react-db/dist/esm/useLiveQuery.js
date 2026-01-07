import { useRef, useSyncExternalStore } from "react";
import { BaseQueryBuilder, CollectionImpl, createLiveQueryCollection } from "@tanstack/db";
const DEFAULT_GC_TIME_MS = 1;
function useLiveQuery(configOrQueryOrCollection, deps = []) {
  const isCollection = configOrQueryOrCollection && typeof configOrQueryOrCollection === `object` && typeof configOrQueryOrCollection.subscribeChanges === `function` && typeof configOrQueryOrCollection.startSyncImmediate === `function` && typeof configOrQueryOrCollection.id === `string`;
  const collectionRef = useRef(
    null
  );
  const depsRef = useRef(null);
  const configRef = useRef(null);
  const versionRef = useRef(0);
  const snapshotRef = useRef(null);
  const needsNewCollection = !collectionRef.current || isCollection && configRef.current !== configOrQueryOrCollection || !isCollection && (depsRef.current === null || depsRef.current.length !== deps.length || depsRef.current.some((dep, i) => dep !== deps[i]));
  if (needsNewCollection) {
    if (isCollection) {
      configOrQueryOrCollection.startSyncImmediate();
      collectionRef.current = configOrQueryOrCollection;
      configRef.current = configOrQueryOrCollection;
    } else {
      if (typeof configOrQueryOrCollection === `function`) {
        const queryBuilder = new BaseQueryBuilder();
        const result = configOrQueryOrCollection(queryBuilder);
        if (result === void 0 || result === null) {
          collectionRef.current = null;
        } else if (result instanceof CollectionImpl) {
          result.startSyncImmediate();
          collectionRef.current = result;
        } else if (result instanceof BaseQueryBuilder) {
          collectionRef.current = createLiveQueryCollection({
            query: configOrQueryOrCollection,
            startSync: true,
            gcTime: DEFAULT_GC_TIME_MS
          });
        } else if (result && typeof result === `object`) {
          collectionRef.current = createLiveQueryCollection({
            startSync: true,
            gcTime: DEFAULT_GC_TIME_MS,
            ...result
          });
        } else {
          throw new Error(
            `useLiveQuery callback must return a QueryBuilder, LiveQueryCollectionConfig, Collection, undefined, or null. Got: ${typeof result}`
          );
        }
        depsRef.current = [...deps];
      } else {
        collectionRef.current = createLiveQueryCollection({
          startSync: true,
          gcTime: DEFAULT_GC_TIME_MS,
          ...configOrQueryOrCollection
        });
        depsRef.current = [...deps];
      }
    }
  }
  if (needsNewCollection) {
    versionRef.current = 0;
    snapshotRef.current = null;
  }
  const subscribeRef = useRef(null);
  if (!subscribeRef.current || needsNewCollection) {
    subscribeRef.current = (onStoreChange) => {
      if (!collectionRef.current) {
        return () => {
        };
      }
      const subscription = collectionRef.current.subscribeChanges(() => {
        versionRef.current += 1;
        onStoreChange();
      });
      if (collectionRef.current.status === `ready`) {
        versionRef.current += 1;
        onStoreChange();
      }
      return () => {
        subscription.unsubscribe();
      };
    };
  }
  const getSnapshotRef = useRef(null);
  if (!getSnapshotRef.current || needsNewCollection) {
    getSnapshotRef.current = () => {
      const currentVersion = versionRef.current;
      const currentCollection = collectionRef.current;
      if (!snapshotRef.current || snapshotRef.current.version !== currentVersion || snapshotRef.current.collection !== currentCollection) {
        snapshotRef.current = {
          collection: currentCollection,
          version: currentVersion
        };
      }
      return snapshotRef.current;
    };
  }
  const snapshot = useSyncExternalStore(
    subscribeRef.current,
    getSnapshotRef.current
  );
  const returnedSnapshotRef = useRef(null);
  const returnedRef = useRef(null);
  if (!returnedSnapshotRef.current || returnedSnapshotRef.current.version !== snapshot.version || returnedSnapshotRef.current.collection !== snapshot.collection) {
    if (!snapshot.collection) {
      returnedRef.current = {
        state: void 0,
        data: void 0,
        collection: void 0,
        status: `disabled`,
        isLoading: false,
        isReady: true,
        isIdle: false,
        isError: false,
        isCleanedUp: false,
        isEnabled: false
      };
    } else {
      const entries = Array.from(snapshot.collection.entries());
      const config = snapshot.collection.config;
      const singleResult = config.singleResult;
      let stateCache = null;
      let dataCache = null;
      returnedRef.current = {
        get state() {
          if (!stateCache) {
            stateCache = new Map(entries);
          }
          return stateCache;
        },
        get data() {
          if (!dataCache) {
            dataCache = entries.map(([, value]) => value);
          }
          return singleResult ? dataCache[0] : dataCache;
        },
        collection: snapshot.collection,
        status: snapshot.collection.status,
        isLoading: snapshot.collection.status === `loading`,
        isReady: snapshot.collection.status === `ready`,
        isIdle: snapshot.collection.status === `idle`,
        isError: snapshot.collection.status === `error`,
        isCleanedUp: snapshot.collection.status === `cleaned-up`,
        isEnabled: true
      };
    }
    returnedSnapshotRef.current = snapshot;
  }
  return returnedRef.current;
}
export {
  useLiveQuery
};
//# sourceMappingURL=useLiveQuery.js.map
