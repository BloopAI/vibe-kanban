import { createTransaction } from "./transactions.js";
function createPacedMutations(config) {
  const { onMutate, mutationFn, strategy, ...transactionConfig } = config;
  let activeTransaction = null;
  const commitCallback = () => {
    if (!activeTransaction) {
      throw new Error(
        `Strategy callback called but no active transaction exists. This indicates a bug in the strategy implementation.`
      );
    }
    if (activeTransaction.state !== `pending`) {
      throw new Error(
        `Strategy callback called but active transaction is in state "${activeTransaction.state}". Expected "pending".`
      );
    }
    const txToCommit = activeTransaction;
    activeTransaction = null;
    txToCommit.commit().catch(() => {
    });
    return txToCommit;
  };
  function mutate(variables) {
    if (!activeTransaction || activeTransaction.state !== `pending`) {
      activeTransaction = createTransaction({
        ...transactionConfig,
        mutationFn,
        autoCommit: false
      });
    }
    activeTransaction.mutate(() => {
      onMutate(variables);
    });
    const txToReturn = activeTransaction;
    if (strategy._type === `queue`) {
      const capturedTx = activeTransaction;
      activeTransaction = null;
      strategy.execute(() => {
        capturedTx.commit().catch(() => {
        });
        return capturedTx;
      });
    } else {
      strategy.execute(commitCallback);
    }
    return txToReturn;
  }
  return mutate;
}
export {
  createPacedMutations
};
//# sourceMappingURL=paced-mutations.js.map
