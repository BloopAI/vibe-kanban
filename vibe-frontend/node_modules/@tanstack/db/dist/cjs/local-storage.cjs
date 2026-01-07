"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const errors = require("./errors.cjs");
function validateJsonSerializable(parser, value, operation) {
  try {
    parser.stringify(value);
  } catch (error) {
    throw new errors.SerializationError(
      operation,
      error instanceof Error ? error.message : String(error)
    );
  }
}
function generateUuid() {
  return crypto.randomUUID();
}
function encodeStorageKey(key) {
  if (typeof key === `number`) {
    return `n:${key}`;
  }
  return `s:${key}`;
}
function decodeStorageKey(encodedKey) {
  if (encodedKey.startsWith(`n:`)) {
    return Number(encodedKey.slice(2));
  }
  if (encodedKey.startsWith(`s:`)) {
    return encodedKey.slice(2);
  }
  return encodedKey;
}
function createInMemoryStorage() {
  const storage = /* @__PURE__ */ new Map();
  return {
    getItem(key) {
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
    removeItem(key) {
      storage.delete(key);
    }
  };
}
function createNoOpStorageEventApi() {
  return {
    addEventListener: () => {
    },
    removeEventListener: () => {
    }
  };
}
function localStorageCollectionOptions(config) {
  if (!config.storageKey) {
    throw new errors.StorageKeyRequiredError();
  }
  const storage = config.storage || (typeof window !== `undefined` ? window.localStorage : null) || createInMemoryStorage();
  const storageEventApi = config.storageEventApi || (typeof window !== `undefined` ? window : null) || createNoOpStorageEventApi();
  const parser = config.parser || JSON;
  const lastKnownData = /* @__PURE__ */ new Map();
  const sync = createLocalStorageSync(
    config.storageKey,
    storage,
    storageEventApi,
    parser,
    config.getKey,
    lastKnownData
  );
  const saveToStorage = (dataMap) => {
    try {
      const objectData = {};
      dataMap.forEach((storedItem, key) => {
        objectData[encodeStorageKey(key)] = storedItem;
      });
      const serialized = parser.stringify(objectData);
      storage.setItem(config.storageKey, serialized);
    } catch (error) {
      console.error(
        `[LocalStorageCollection] Error saving data to storage key "${config.storageKey}":`,
        error
      );
      throw error;
    }
  };
  const clearStorage = () => {
    storage.removeItem(config.storageKey);
  };
  const getStorageSize = () => {
    const data = storage.getItem(config.storageKey);
    return data ? new Blob([data]).size : 0;
  };
  const wrappedOnInsert = async (params) => {
    params.transaction.mutations.forEach((mutation) => {
      validateJsonSerializable(parser, mutation.modified, `insert`);
    });
    let handlerResult = {};
    if (config.onInsert) {
      handlerResult = await config.onInsert(params) ?? {};
    }
    params.transaction.mutations.forEach((mutation) => {
      const storedItem = {
        versionKey: generateUuid(),
        data: mutation.modified
      };
      lastKnownData.set(mutation.key, storedItem);
    });
    saveToStorage(lastKnownData);
    sync.confirmOperationsSync(params.transaction.mutations);
    return handlerResult;
  };
  const wrappedOnUpdate = async (params) => {
    params.transaction.mutations.forEach((mutation) => {
      validateJsonSerializable(parser, mutation.modified, `update`);
    });
    let handlerResult = {};
    if (config.onUpdate) {
      handlerResult = await config.onUpdate(params) ?? {};
    }
    params.transaction.mutations.forEach((mutation) => {
      const storedItem = {
        versionKey: generateUuid(),
        data: mutation.modified
      };
      lastKnownData.set(mutation.key, storedItem);
    });
    saveToStorage(lastKnownData);
    sync.confirmOperationsSync(params.transaction.mutations);
    return handlerResult;
  };
  const wrappedOnDelete = async (params) => {
    let handlerResult = {};
    if (config.onDelete) {
      handlerResult = await config.onDelete(params) ?? {};
    }
    params.transaction.mutations.forEach((mutation) => {
      lastKnownData.delete(mutation.key);
    });
    saveToStorage(lastKnownData);
    sync.confirmOperationsSync(params.transaction.mutations);
    return handlerResult;
  };
  const {
    storageKey: _storageKey,
    storage: _storage,
    storageEventApi: _storageEventApi,
    onInsert: _onInsert,
    onUpdate: _onUpdate,
    onDelete: _onDelete,
    id,
    ...restConfig
  } = config;
  const collectionId = id ?? `local-collection:${config.storageKey}`;
  const acceptMutations = (transaction) => {
    const collectionMutations = transaction.mutations.filter((m) => {
      if (sync.collection && m.collection === sync.collection) {
        return true;
      }
      return m.collection.id === collectionId;
    });
    if (collectionMutations.length === 0) {
      return;
    }
    for (const mutation of collectionMutations) {
      switch (mutation.type) {
        case `insert`:
        case `update`:
          validateJsonSerializable(parser, mutation.modified, mutation.type);
          break;
        case `delete`:
          validateJsonSerializable(parser, mutation.original, mutation.type);
          break;
      }
    }
    for (const mutation of collectionMutations) {
      switch (mutation.type) {
        case `insert`:
        case `update`: {
          const storedItem = {
            versionKey: generateUuid(),
            data: mutation.modified
          };
          lastKnownData.set(mutation.key, storedItem);
          break;
        }
        case `delete`: {
          lastKnownData.delete(mutation.key);
          break;
        }
      }
    }
    saveToStorage(lastKnownData);
    sync.confirmOperationsSync(collectionMutations);
  };
  return {
    ...restConfig,
    id: collectionId,
    sync,
    onInsert: wrappedOnInsert,
    onUpdate: wrappedOnUpdate,
    onDelete: wrappedOnDelete,
    utils: {
      clearStorage,
      getStorageSize,
      acceptMutations
    }
  };
}
function loadFromStorage(storageKey, storage, parser) {
  try {
    const rawData = storage.getItem(storageKey);
    if (!rawData) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parser.parse(rawData);
    const dataMap = /* @__PURE__ */ new Map();
    if (typeof parsed === `object` && parsed !== null && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([encodedKey, value]) => {
        if (value && typeof value === `object` && `versionKey` in value && `data` in value) {
          const storedItem = value;
          const decodedKey = decodeStorageKey(encodedKey);
          dataMap.set(decodedKey, storedItem);
        } else {
          throw new errors.InvalidStorageDataFormatError(storageKey, encodedKey);
        }
      });
    } else {
      throw new errors.InvalidStorageObjectFormatError(storageKey);
    }
    return dataMap;
  } catch (error) {
    console.warn(
      `[LocalStorageCollection] Error loading data from storage key "${storageKey}":`,
      error
    );
    return /* @__PURE__ */ new Map();
  }
}
function createLocalStorageSync(storageKey, storage, storageEventApi, parser, _getKey, lastKnownData) {
  let syncParams = null;
  let collection = null;
  const findChanges = (oldData, newData) => {
    const changes = [];
    oldData.forEach((oldStoredItem, key) => {
      const newStoredItem = newData.get(key);
      if (!newStoredItem) {
        changes.push({ type: `delete`, key, value: oldStoredItem.data });
      } else if (oldStoredItem.versionKey !== newStoredItem.versionKey) {
        changes.push({ type: `update`, key, value: newStoredItem.data });
      }
    });
    newData.forEach((newStoredItem, key) => {
      if (!oldData.has(key)) {
        changes.push({ type: `insert`, key, value: newStoredItem.data });
      }
    });
    return changes;
  };
  const processStorageChanges = () => {
    if (!syncParams) return;
    const { begin, write, commit } = syncParams;
    const newData = loadFromStorage(storageKey, storage, parser);
    const changes = findChanges(lastKnownData, newData);
    if (changes.length > 0) {
      begin();
      changes.forEach(({ type, value }) => {
        if (value) {
          validateJsonSerializable(parser, value, type);
          write({ type, value });
        }
      });
      commit();
      lastKnownData.clear();
      newData.forEach((storedItem, key) => {
        lastKnownData.set(key, storedItem);
      });
    }
  };
  const syncConfig = {
    sync: (params) => {
      const { begin, write, commit, markReady } = params;
      syncParams = params;
      collection = params.collection;
      const initialData = loadFromStorage(storageKey, storage, parser);
      if (initialData.size > 0) {
        begin();
        initialData.forEach((storedItem) => {
          validateJsonSerializable(parser, storedItem.data, `load`);
          write({ type: `insert`, value: storedItem.data });
        });
        commit();
      }
      lastKnownData.clear();
      initialData.forEach((storedItem, key) => {
        lastKnownData.set(key, storedItem);
      });
      markReady();
      const handleStorageEvent = (event) => {
        if (event.key !== storageKey || event.storageArea !== storage) {
          return;
        }
        processStorageChanges();
      };
      storageEventApi.addEventListener(`storage`, handleStorageEvent);
    },
    /**
     * Get sync metadata - returns storage key information
     * @returns Object containing storage key and storage type metadata
     */
    getSyncMetadata: () => ({
      storageKey,
      storageType: storage === (typeof window !== `undefined` ? window.localStorage : null) ? `localStorage` : `custom`
    }),
    // Manual trigger function for local updates
    manualTrigger: processStorageChanges,
    // Collection instance reference
    collection
  };
  const confirmOperationsSync = (mutations) => {
    if (!syncParams) {
      return;
    }
    const { begin, write, commit } = syncParams;
    begin();
    mutations.forEach((mutation) => {
      write({
        type: mutation.type,
        value: mutation.type === `delete` ? mutation.original : mutation.modified
      });
    });
    commit();
  };
  return {
    ...syncConfig,
    confirmOperationsSync
  };
}
exports.localStorageCollectionOptions = localStorageCollectionOptions;
//# sourceMappingURL=local-storage.cjs.map
