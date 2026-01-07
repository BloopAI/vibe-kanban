function localOnlyCollectionOptions(config) {
  const { initialData, onInsert, onUpdate, onDelete, ...restConfig } = config;
  const syncResult = createLocalOnlySync(initialData);
  const wrappedOnInsert = async (params) => {
    let handlerResult;
    if (onInsert) {
      handlerResult = await onInsert(params) ?? {};
    }
    syncResult.confirmOperationsSync(params.transaction.mutations);
    return handlerResult;
  };
  const wrappedOnUpdate = async (params) => {
    let handlerResult;
    if (onUpdate) {
      handlerResult = await onUpdate(params) ?? {};
    }
    syncResult.confirmOperationsSync(params.transaction.mutations);
    return handlerResult;
  };
  const wrappedOnDelete = async (params) => {
    let handlerResult;
    if (onDelete) {
      handlerResult = await onDelete(params) ?? {};
    }
    syncResult.confirmOperationsSync(params.transaction.mutations);
    return handlerResult;
  };
  const acceptMutations = (transaction) => {
    const collectionMutations = transaction.mutations.filter(
      (m) => (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        m.collection === syncResult.collection
      )
    );
    if (collectionMutations.length === 0) {
      return;
    }
    syncResult.confirmOperationsSync(
      collectionMutations
    );
  };
  return {
    ...restConfig,
    sync: syncResult.sync,
    onInsert: wrappedOnInsert,
    onUpdate: wrappedOnUpdate,
    onDelete: wrappedOnDelete,
    utils: {
      acceptMutations
    },
    startSync: true,
    gcTime: 0
  };
}
function createLocalOnlySync(initialData) {
  let syncBegin = null;
  let syncWrite = null;
  let syncCommit = null;
  let collection = null;
  const sync = {
    /**
     * Sync function that captures sync parameters and applies initial data
     * @param params - Sync parameters containing begin, write, and commit functions
     * @returns Unsubscribe function (empty since no ongoing sync is needed)
     */
    sync: (params) => {
      const { begin, write, commit, markReady } = params;
      syncBegin = begin;
      syncWrite = write;
      syncCommit = commit;
      collection = params.collection;
      if (initialData && initialData.length > 0) {
        begin();
        initialData.forEach((item) => {
          write({
            type: `insert`,
            value: item
          });
        });
        commit();
      }
      markReady();
      return () => {
      };
    },
    /**
     * Get sync metadata - returns empty object for local-only collections
     * @returns Empty metadata object
     */
    getSyncMetadata: () => ({})
  };
  const confirmOperationsSync = (mutations) => {
    if (!syncBegin || !syncWrite || !syncCommit) {
      return;
    }
    syncBegin();
    mutations.forEach((mutation) => {
      if (syncWrite) {
        syncWrite({
          type: mutation.type,
          value: mutation.modified
        });
      }
    });
    syncCommit();
  };
  return {
    sync,
    confirmOperationsSync,
    collection
  };
}
export {
  localOnlyCollectionOptions
};
//# sourceMappingURL=local-only.js.map
