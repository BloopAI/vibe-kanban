import { useState, useMemo, useCallback } from 'react';
import type {
  BaseCodingAgent,
  ExecutorConfig,
  ExecutorProfileId,
} from 'shared/types';
import { getVariantOptions } from '@/utils/executor';
import { useVariant } from './useVariant';

interface UseExecutorSelectionOptions {
  profiles: Record<string, ExecutorConfig> | null;
  latestProfileId: ExecutorProfileId | null;
  isNewSessionMode: boolean;
  scratchVariant: string | null | undefined;
  /** User's saved executor preference from config */
  configExecutorProfile?: ExecutorProfileId | null;
}

interface UseExecutorSelectionResult {
  /** Combined executor + variant profile */
  executorProfileId: ExecutorProfileId | null;
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
  isNewSessionMode,
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
    () =>
      getVariantOptions(
        isNewSessionMode ? effectiveExecutor : latestProfileId?.executor,
        profiles
      ),
    [isNewSessionMode, effectiveExecutor, latestProfileId?.executor, profiles]
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

  // Build the combined executor + variant profile
  const executorProfileId = useMemo<ExecutorProfileId | null>(() => {
    if (!effectiveExecutor) return null;
    return { executor: effectiveExecutor, variant: selectedVariant };
  }, [effectiveExecutor, selectedVariant]);

  return {
    executorProfileId,
    executorOptions,
    handleExecutorChange,
    selectedVariant,
    variantOptions,
    setSelectedVariant,
  };
}
