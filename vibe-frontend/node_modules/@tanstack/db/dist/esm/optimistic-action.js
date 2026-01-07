import { createTransaction } from "./transactions.js";
import { OnMutateMustBeSynchronousError } from "./errors.js";
import { isPromiseLike } from "./utils/type-guards.js";
function createOptimisticAction(options) {
  const { mutationFn, onMutate, ...config } = options;
  return (variables) => {
    const transaction = createTransaction({
      ...config,
      // Wire the mutationFn to use the provided variables
      mutationFn: async (params) => {
        return await mutationFn(variables, params);
      }
    });
    transaction.mutate(() => {
      const maybePromise = onMutate(variables);
      if (isPromiseLike(maybePromise)) {
        throw new OnMutateMustBeSynchronousError();
      }
    });
    return transaction;
  };
}
export {
  createOptimisticAction
};
//# sourceMappingURL=optimistic-action.js.map
