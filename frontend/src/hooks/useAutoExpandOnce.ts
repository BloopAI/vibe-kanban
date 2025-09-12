import { useEffect, useRef } from 'react';

interface Params {
  autoExpand?: boolean;
  expanded: boolean;
  expand: () => void;
  condition?: boolean;
}

export function useAutoExpandOnce({
  autoExpand,
  expanded,
  expand,
  condition = true,
}: Params) {
  const hasExpandedRef = useRef(false);

  useEffect(() => {
    if (!autoExpand) {
      hasExpandedRef.current = false;
      return;
    }

    if (!hasExpandedRef.current && condition && !expanded) {
      expand();
      hasExpandedRef.current = true;
    }
  }, [autoExpand, condition, expanded, expand]);
}
