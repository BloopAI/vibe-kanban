"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const react = require("react");
const db = require("@tanstack/db");
function usePacedMutations(config) {
  const onMutateRef = react.useRef(config.onMutate);
  onMutateRef.current = config.onMutate;
  const mutationFnRef = react.useRef(config.mutationFn);
  mutationFnRef.current = config.mutationFn;
  const stableOnMutate = react.useCallback((variables) => {
    return onMutateRef.current(variables);
  }, []);
  const stableMutationFn = react.useCallback((params) => {
    return mutationFnRef.current(params);
  }, []);
  const mutate = react.useMemo(() => {
    return db.createPacedMutations({
      ...config,
      onMutate: stableOnMutate,
      mutationFn: stableMutationFn
    });
  }, [
    stableOnMutate,
    stableMutationFn,
    config.metadata,
    // Serialize strategy to avoid recreating when object reference changes but values are same
    JSON.stringify({
      type: config.strategy._type,
      options: config.strategy.options
    })
  ]);
  const stableMutate = react.useCallback(mutate, [mutate]);
  return stableMutate;
}
exports.usePacedMutations = usePacedMutations;
//# sourceMappingURL=usePacedMutations.cjs.map
