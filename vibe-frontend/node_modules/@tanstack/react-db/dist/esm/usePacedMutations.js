import { useRef, useCallback, useMemo } from "react";
import { createPacedMutations } from "@tanstack/db";
function usePacedMutations(config) {
  const onMutateRef = useRef(config.onMutate);
  onMutateRef.current = config.onMutate;
  const mutationFnRef = useRef(config.mutationFn);
  mutationFnRef.current = config.mutationFn;
  const stableOnMutate = useCallback((variables) => {
    return onMutateRef.current(variables);
  }, []);
  const stableMutationFn = useCallback((params) => {
    return mutationFnRef.current(params);
  }, []);
  const mutate = useMemo(() => {
    return createPacedMutations({
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
  const stableMutate = useCallback(mutate, [mutate]);
  return stableMutate;
}
export {
  usePacedMutations
};
//# sourceMappingURL=usePacedMutations.js.map
