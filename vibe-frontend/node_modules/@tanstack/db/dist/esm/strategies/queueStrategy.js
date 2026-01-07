import { LiteQueuer } from "@tanstack/pacer-lite/lite-queuer";
function queueStrategy(options) {
  let processingChain = Promise.resolve();
  const queuer = new LiteQueuer(
    (fn) => {
      processingChain = processingChain.then(async () => {
        const transaction = fn();
        await transaction.isPersisted.promise;
      }).catch(() => {
      });
    },
    {
      wait: options?.wait ?? 0,
      maxSize: options?.maxSize,
      addItemsTo: options?.addItemsTo ?? `back`,
      // Default FIFO: add to back
      getItemsFrom: options?.getItemsFrom ?? `front`,
      // Default FIFO: get from front
      started: true
      // Start processing immediately
    }
  );
  return {
    _type: `queue`,
    options,
    execute: (fn) => {
      queuer.addItem(fn);
    },
    cleanup: () => {
      queuer.stop();
      queuer.clear();
    }
  };
}
export {
  queueStrategy
};
//# sourceMappingURL=queueStrategy.js.map
