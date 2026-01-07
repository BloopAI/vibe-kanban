import { useEffect, useRef } from "react";

export const useUnmount = (cb: () => void, deps: any[]) => {
  const ref = useRef(cb);

  ref.current = cb;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => ref.current, deps);
};
