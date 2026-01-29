import { useState, useMemo, useCallback } from 'react';
import type { BaseCodingAgent, ExecutorConfig } from 'shared/types';
import { getVariantOptions } from '@/utils/executor';
import { useVariant } from './useVariant';

interface ExecutorProfileId {
  executor: BaseCodingAgent;
  variant: string | null;
}

interface UseExecutorSelectionOptions {
  profiles: Record<string, ExecutorConfig> | null;
  latestProfileId: ExecutorProfileId | null;
  scratchVariant: string | null | undefined;
  /** User's saved executor preference from config */
  configExecutorProfile?: ExecutorProfileId | null;
}

interface UseExecutorSelectionResult {
  /** Effective executor: user selection > latest from processes > first available */
  effectiveExecutor: BaseCodingAgent | null;
  /** Available executor options */
  executorOptions: BaseCodingAgent[];
  /** Handle executor change (resets variant) */
  handleExecutorChange: (executor: BaseCodingAgent) => void;
  /** Currently selected variant */
  selectedVariant: string | null;
  /** Available variant options for current executor */
  variantOptions: string[];
  /** Set selected variant */
  setSelectedVariant: (variant: string | null) => void;
}

/**
 * Hook to manage executor and variant selection with priority:
 * - Executor: user selection > latest from processes > config preference > first available
 * - Variant: user selection > scratch > process
 */
export function useExecutorSelection({
  profiles,
  latestProfileId,
  scratchVariant,
  configExecutorProfile,
}: UseExecutorSelectionOptions): UseExecutorSelectionResult {
  const [selectedExecutor, setSelectedExecutor] =
    useState<BaseCodingAgent | null>(null);

  const executorOptions = useMemo(
    () => Object.keys(profiles ?? {}) as BaseCodingAgent[],
    [profiles]
  );

  const effectiveExecutor = useMemo(
    () =>
      selectedExecutor ??
      latestProfileId?.executor ??
      configExecutorProfile?.executor ??
      executorOptions[0] ??
      null,
    [
      selectedExecutor,
      latestProfileId?.executor,
      configExecutorProfile?.executor,
      executorOptions,
    ]
  );

  const variantOptions = useMemo(
    () => getVariantOptions(effectiveExecutor, profiles),
    [effectiveExecutor, profiles]
  );

  const { selectedVariant, setSelectedVariant } = useVariant({
    processVariant: latestProfileId?.variant ?? null,
    scratchVariant,
  });

  const handleExecutorChange = useCallback(
    (executor: BaseCodingAgent) => {
      setSelectedExecutor(executor);
      // Reset variant to first available for the new executor
      const newVariantOptions = getVariantOptions(executor, profiles);
      setSelectedVariant(newVariantOptions[0] ?? null);
    },
    [profiles, setSelectedVariant]
  );

  return {
    effectiveExecutor,
    executorOptions,
    handleExecutorChange,
    selectedVariant,
    variantOptions,
    setSelectedVariant,
  };
}
