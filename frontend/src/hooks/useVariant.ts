import { useCallback, useEffect, useRef, useState } from 'react';

type Args = {
  processVariant: string | null;
};

/**
 * Hook to manage variant selection with priority:
 * 1. User dropdown selection (current session) - highest priority
 * 2. Last execution process variant (fallback)
 */
export function useVariant({ processVariant }: Args) {
  // Track if user has explicitly selected a variant this session
  const hasUserSelectionRef = useRef(false);

  const [selectedVariant, setSelectedVariantState] = useState<string | null>(
    processVariant
  );

  // Sync state when inputs change (if user hasn't made a selection)
  useEffect(() => {
    if (hasUserSelectionRef.current) return;
    setSelectedVariantState(processVariant);
  }, [processVariant]);

  // When user explicitly selects a variant, mark it and update state
  const setSelectedVariant = useCallback((variant: string | null) => {
    hasUserSelectionRef.current = true;
    setSelectedVariantState(variant);
  }, []);

  return { selectedVariant, setSelectedVariant } as const;
}
