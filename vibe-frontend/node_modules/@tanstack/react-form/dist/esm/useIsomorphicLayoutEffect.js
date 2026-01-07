import { useLayoutEffect, useEffect } from "react";
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
export {
  useIsomorphicLayoutEffect
};
//# sourceMappingURL=useIsomorphicLayoutEffect.js.map
