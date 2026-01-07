"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const transactions = require("./transactions.cjs");
const errors = require("./errors.cjs");
const typeGuards = require("./utils/type-guards.cjs");
function createOptimisticAction(options) {
  const { mutationFn, onMutate, ...config } = options;
  return (variables) => {
    const transaction = transactions.createTransaction({
      ...config,
      // Wire the mutationFn to use the provided variables
      mutationFn: async (params) => {
        return await mutationFn(variables, params);
      }
    });
    transaction.mutate(() => {
      const maybePromise = onMutate(variables);
      if (typeGuards.isPromiseLike(maybePromise)) {
        throw new errors.OnMutateMustBeSynchronousError();
      }
    });
    return transaction;
  };
}
exports.createOptimisticAction = createOptimisticAction;
//# sourceMappingURL=optimistic-action.cjs.map
