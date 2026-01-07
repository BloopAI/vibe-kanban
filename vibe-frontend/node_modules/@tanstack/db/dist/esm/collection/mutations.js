import { withArrayChangeTracking, withChangeTracking } from "../proxy.js";
import { getActiveTransaction, createTransaction } from "../transactions.js";
import { MissingInsertHandlerError, DuplicateKeyError, MissingDeleteHandlerError, NoKeysPassedToDeleteError, DeleteKeyNotFoundError, InvalidSchemaError, SchemaMustBeSynchronousError, SchemaValidationError, UndefinedKeyError, InvalidKeyError, MissingUpdateArgumentError, MissingUpdateHandlerError, NoKeysPassedToUpdateError, UpdateKeyNotFoundError, KeyUpdateNotAllowedError } from "../errors.js";
class CollectionMutationsManager {
  constructor(config, id) {
    this.insert = (data, config2) => {
      this.lifecycle.validateCollectionUsable(`insert`);
      const state = this.state;
      const ambientTransaction = getActiveTransaction();
      if (!ambientTransaction && !this.config.onInsert) {
        throw new MissingInsertHandlerError();
      }
      const items = Array.isArray(data) ? data : [data];
      const mutations = [];
      const keysInCurrentBatch = /* @__PURE__ */ new Set();
      items.forEach((item) => {
        const validatedData = this.validateData(item, `insert`);
        const key = this.config.getKey(validatedData);
        if (this.state.has(key) || keysInCurrentBatch.has(key)) {
          throw new DuplicateKeyError(key);
        }
        keysInCurrentBatch.add(key);
        const globalKey = this.generateGlobalKey(key, item);
        const mutation = {
          mutationId: crypto.randomUUID(),
          original: {},
          modified: validatedData,
          // Pick the values from validatedData based on what's passed in - this is for cases
          // where a schema has default values. The validated data has the extra default
          // values but for changes, we just want to show the data that was actually passed in.
          changes: Object.fromEntries(
            Object.keys(item).map((k) => [
              k,
              validatedData[k]
            ])
          ),
          globalKey,
          key,
          metadata: config2?.metadata,
          syncMetadata: this.config.sync.getSyncMetadata?.() || {},
          optimistic: config2?.optimistic ?? true,
          type: `insert`,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
          collection: this.collection
        };
        mutations.push(mutation);
      });
      if (ambientTransaction) {
        ambientTransaction.applyMutations(mutations);
        state.transactions.set(ambientTransaction.id, ambientTransaction);
        state.scheduleTransactionCleanup(ambientTransaction);
        state.recomputeOptimisticState(true);
        return ambientTransaction;
      } else {
        const directOpTransaction = createTransaction({
          mutationFn: async (params) => {
            return await this.config.onInsert({
              transaction: params.transaction,
              collection: this.collection
            });
          }
        });
        directOpTransaction.applyMutations(mutations);
        directOpTransaction.commit().catch(() => void 0);
        state.transactions.set(directOpTransaction.id, directOpTransaction);
        state.scheduleTransactionCleanup(directOpTransaction);
        state.recomputeOptimisticState(true);
        return directOpTransaction;
      }
    };
    this.delete = (keys, config2) => {
      const state = this.state;
      this.lifecycle.validateCollectionUsable(`delete`);
      const ambientTransaction = getActiveTransaction();
      if (!ambientTransaction && !this.config.onDelete) {
        throw new MissingDeleteHandlerError();
      }
      if (Array.isArray(keys) && keys.length === 0) {
        throw new NoKeysPassedToDeleteError();
      }
      const keysArray = Array.isArray(keys) ? keys : [keys];
      const mutations = [];
      for (const key of keysArray) {
        if (!this.state.has(key)) {
          throw new DeleteKeyNotFoundError(key);
        }
        const globalKey = this.generateGlobalKey(key, this.state.get(key));
        const mutation = {
          mutationId: crypto.randomUUID(),
          original: this.state.get(key),
          modified: this.state.get(key),
          changes: this.state.get(key),
          globalKey,
          key,
          metadata: config2?.metadata,
          syncMetadata: state.syncedMetadata.get(key) || {},
          optimistic: config2?.optimistic ?? true,
          type: `delete`,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
          collection: this.collection
        };
        mutations.push(mutation);
      }
      if (ambientTransaction) {
        ambientTransaction.applyMutations(mutations);
        state.transactions.set(ambientTransaction.id, ambientTransaction);
        state.scheduleTransactionCleanup(ambientTransaction);
        state.recomputeOptimisticState(true);
        return ambientTransaction;
      }
      const directOpTransaction = createTransaction({
        autoCommit: true,
        mutationFn: async (params) => {
          return this.config.onDelete({
            transaction: params.transaction,
            collection: this.collection
          });
        }
      });
      directOpTransaction.applyMutations(mutations);
      directOpTransaction.commit().catch(() => void 0);
      state.transactions.set(directOpTransaction.id, directOpTransaction);
      state.scheduleTransactionCleanup(directOpTransaction);
      state.recomputeOptimisticState(true);
      return directOpTransaction;
    };
    this.id = id;
    this.config = config;
  }
  setDeps(deps) {
    this.lifecycle = deps.lifecycle;
    this.state = deps.state;
    this.collection = deps.collection;
  }
  ensureStandardSchema(schema) {
    if (schema && `~standard` in schema) {
      return schema;
    }
    throw new InvalidSchemaError();
  }
  validateData(data, type, key) {
    if (!this.config.schema) return data;
    const standardSchema = this.ensureStandardSchema(this.config.schema);
    if (type === `update` && key) {
      const existingData = this.state.get(key);
      if (existingData && data && typeof data === `object` && typeof existingData === `object`) {
        const mergedData = Object.assign({}, existingData, data);
        const result2 = standardSchema[`~standard`].validate(mergedData);
        if (result2 instanceof Promise) {
          throw new SchemaMustBeSynchronousError();
        }
        if (`issues` in result2 && result2.issues) {
          const typedIssues = result2.issues.map((issue) => ({
            message: issue.message,
            path: issue.path?.map((p) => String(p))
          }));
          throw new SchemaValidationError(type, typedIssues);
        }
        const validatedMergedData = result2.value;
        const modifiedKeys = Object.keys(data);
        const extractedChanges = Object.fromEntries(
          modifiedKeys.map((k) => [k, validatedMergedData[k]])
        );
        return extractedChanges;
      }
    }
    const result = standardSchema[`~standard`].validate(data);
    if (result instanceof Promise) {
      throw new SchemaMustBeSynchronousError();
    }
    if (`issues` in result && result.issues) {
      const typedIssues = result.issues.map((issue) => ({
        message: issue.message,
        path: issue.path?.map((p) => String(p))
      }));
      throw new SchemaValidationError(type, typedIssues);
    }
    return result.value;
  }
  generateGlobalKey(key, item) {
    if (typeof key !== `string` && typeof key !== `number`) {
      if (typeof key === `undefined`) {
        throw new UndefinedKeyError(item);
      }
      throw new InvalidKeyError(key, item);
    }
    return `KEY::${this.id}/${key}`;
  }
  /**
   * Updates one or more items in the collection using a callback function
   */
  update(keys, configOrCallback, maybeCallback) {
    if (typeof keys === `undefined`) {
      throw new MissingUpdateArgumentError();
    }
    const state = this.state;
    this.lifecycle.validateCollectionUsable(`update`);
    const ambientTransaction = getActiveTransaction();
    if (!ambientTransaction && !this.config.onUpdate) {
      throw new MissingUpdateHandlerError();
    }
    const isArray = Array.isArray(keys);
    const keysArray = isArray ? keys : [keys];
    if (isArray && keysArray.length === 0) {
      throw new NoKeysPassedToUpdateError();
    }
    const callback = typeof configOrCallback === `function` ? configOrCallback : maybeCallback;
    const config = typeof configOrCallback === `function` ? {} : configOrCallback;
    const currentObjects = keysArray.map((key) => {
      const item = this.state.get(key);
      if (!item) {
        throw new UpdateKeyNotFoundError(key);
      }
      return item;
    });
    let changesArray;
    if (isArray) {
      changesArray = withArrayChangeTracking(
        currentObjects,
        callback
      );
    } else {
      const result = withChangeTracking(
        currentObjects[0],
        callback
      );
      changesArray = [result];
    }
    const mutations = keysArray.map((key, index) => {
      const itemChanges = changesArray[index];
      if (!itemChanges || Object.keys(itemChanges).length === 0) {
        return null;
      }
      const originalItem = currentObjects[index];
      const validatedUpdatePayload = this.validateData(
        itemChanges,
        `update`,
        key
      );
      const modifiedItem = Object.assign(
        {},
        originalItem,
        validatedUpdatePayload
      );
      const originalItemId = this.config.getKey(originalItem);
      const modifiedItemId = this.config.getKey(modifiedItem);
      if (originalItemId !== modifiedItemId) {
        throw new KeyUpdateNotAllowedError(originalItemId, modifiedItemId);
      }
      const globalKey = this.generateGlobalKey(modifiedItemId, modifiedItem);
      return {
        mutationId: crypto.randomUUID(),
        original: originalItem,
        modified: modifiedItem,
        // Pick the values from modifiedItem based on what's passed in - this is for cases
        // where a schema has default values or transforms. The modified data has the extra
        // default or transformed values but for changes, we just want to show the data that
        // was actually passed in.
        changes: Object.fromEntries(
          Object.keys(itemChanges).map((k) => [
            k,
            modifiedItem[k]
          ])
        ),
        globalKey,
        key,
        metadata: config.metadata,
        syncMetadata: state.syncedMetadata.get(key) || {},
        optimistic: config.optimistic ?? true,
        type: `update`,
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        collection: this.collection
      };
    }).filter(Boolean);
    if (mutations.length === 0) {
      const emptyTransaction = createTransaction({
        mutationFn: async () => {
        }
      });
      emptyTransaction.commit().catch(() => void 0);
      state.scheduleTransactionCleanup(emptyTransaction);
      return emptyTransaction;
    }
    if (ambientTransaction) {
      ambientTransaction.applyMutations(mutations);
      state.transactions.set(ambientTransaction.id, ambientTransaction);
      state.scheduleTransactionCleanup(ambientTransaction);
      state.recomputeOptimisticState(true);
      return ambientTransaction;
    }
    const directOpTransaction = createTransaction({
      mutationFn: async (params) => {
        return this.config.onUpdate({
          transaction: params.transaction,
          collection: this.collection
        });
      }
    });
    directOpTransaction.applyMutations(mutations);
    directOpTransaction.commit().catch(() => void 0);
    state.transactions.set(directOpTransaction.id, directOpTransaction);
    state.scheduleTransactionCleanup(directOpTransaction);
    state.recomputeOptimisticState(true);
    return directOpTransaction;
  }
}
export {
  CollectionMutationsManager
};
//# sourceMappingURL=mutations.js.map
