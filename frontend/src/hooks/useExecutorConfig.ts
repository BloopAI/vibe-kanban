import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BaseCodingAgent,
  ExecutorConfig,
  ExecutorProfile,
  ExecutorProfileId,
} from 'shared/types';
import { getVariantOptions } from '@/utils/executor';
import { usePresetOptions } from '@/hooks/usePresetOptions';

function getProfileKey(
  executor: BaseCodingAgent | null,
  variant: string | null
): string | null {
  if (!executor) return null;
  return `${executor}:${variant ?? 'DEFAULT'}`;
}

const OVERRIDE_FIELDS = [
  'model_id',
  'agent_id',
  'reasoning_id',
  'permission_policy',
] as const;

export type ExecutorSelectionMode = 'resume' | 'explicit';

/**
 * Resolves effective executor.
 * resume: userSelections.executor → scratch → lastUsedConfig → configDefault → first available
 * explicit: userSelections.executor only
 */
function useEffectiveExecutor(
  userSelections: Partial<ExecutorConfig>,
  profiles: Record<string, ExecutorProfile> | null,
  scratchConfig: ExecutorConfig | null | undefined,
  lastUsedConfig: ExecutorConfig | null,
  configExecutorProfile: ExecutorProfileId | null | undefined,
  selectionMode: ExecutorSelectionMode
) {
  const options = useMemo(
    () => Object.keys(profiles ?? {}) as BaseCodingAgent[],
    [profiles]
  );

  const effective = useMemo(() => {
    if (selectionMode === 'explicit') {
      return userSelections.executor ?? null;
    }
    return (
      userSelections.executor ??
      scratchConfig?.executor ??
      lastUsedConfig?.executor ??
      configExecutorProfile?.executor ??
      options[0] ??
      null
    );
  }, [
    userSelections.executor,
    scratchConfig,
    lastUsedConfig,
    configExecutorProfile,
    options,
    selectionMode,
  ]);

  return { effective, options };
}

/**
 * Resolves effective variant.
 * resume: userSelections.variant → scratch (if same executor) → lastUsedConfig (if same executor)
 * → configDefault → DEFAULT/first
 * explicit: userSelections.variant only
 */
function useEffectiveVariant(
  userSelections: Partial<ExecutorConfig>,
  effectiveExecutor: BaseCodingAgent | null,
  profiles: Record<string, ExecutorProfile> | null,
  scratchConfig: ExecutorConfig | null | undefined,
  lastUsedConfig: ExecutorConfig | null,
  configExecutorProfile: ExecutorProfileId | null | undefined,
  selectionMode: ExecutorSelectionMode
) {
  const options = useMemo(
    () => getVariantOptions(effectiveExecutor, profiles),
    [effectiveExecutor, profiles]
  );

  const wasUserSelected = 'variant' in userSelections;

  const resolved = useMemo(() => {
    if (wasUserSelected) return userSelections.variant ?? null;
    if (selectionMode === 'explicit') return null;

    if (
      scratchConfig !== undefined &&
      scratchConfig?.executor === effectiveExecutor &&
      scratchConfig?.variant !== undefined
    ) {
      return scratchConfig.variant ?? null;
    }

    if (lastUsedConfig?.executor === effectiveExecutor) {
      return lastUsedConfig.variant ?? null;
    }

    if (configExecutorProfile?.executor === effectiveExecutor) {
      return configExecutorProfile.variant ?? null;
    }

    return (options.includes('DEFAULT') ? 'DEFAULT' : options[0]) ?? null;
  }, [
    wasUserSelected,
    userSelections.variant,
    scratchConfig,
    effectiveExecutor,
    lastUsedConfig,
    configExecutorProfile,
    options,
    selectionMode,
  ]);

  return { resolved, options, wasUserSelected };
}

/**
 * Resolves each override field independently through the fallback chain:
 * resume: userSelections[field] → scratch[field] → lastUsed[field] → preset[field]
 * explicit: userSelections[field] only
 */
function useEffectiveOverrides(
  effectiveExecutor: BaseCodingAgent | null,
  resolvedVariant: string | null,
  userSelections: Partial<ExecutorConfig>,
  scratchConfig: ExecutorConfig | null | undefined,
  lastUsedConfig: ExecutorConfig | null,
  variantWasUserSelected: boolean,
  presetOptions: ExecutorConfig | null | undefined,
  selectionMode: ExecutorSelectionMode
) {
  return useMemo((): ExecutorConfig | null => {
    if (!effectiveExecutor) return null;

    const profileKey = getProfileKey(effectiveExecutor, resolvedVariant);
    const scratchMatches = scratchConfig
      ? getProfileKey(scratchConfig.executor, scratchConfig.variant ?? null) ===
        profileKey
      : false;
    const lastUsedMatches = lastUsedConfig
      ? getProfileKey(
          lastUsedConfig.executor,
          lastUsedConfig.variant ?? null
        ) === profileKey
      : false;

    const resolved: ExecutorConfig = {
      executor: effectiveExecutor,
      variant: resolvedVariant,
    };

    for (const field of OVERRIDE_FIELDS) {
      const modelMustMatch = field === 'reasoning_id';
      const scratchModelMatches =
        !modelMustMatch || scratchConfig?.model_id === resolved.model_id;
      const lastUsedModelMatches =
        !modelMustMatch || lastUsedConfig?.model_id === resolved.model_id;

      const value =
        selectionMode === 'explicit'
          ? field in userSelections
            ? userSelections[field]
            : undefined
          : field in userSelections
            ? userSelections[field]
            : ((scratchMatches && scratchModelMatches
                ? scratchConfig?.[field]
                : undefined) ??
              (lastUsedMatches && lastUsedModelMatches
                ? lastUsedConfig?.[field]
                : undefined) ??
              (variantWasUserSelected ? presetOptions?.[field] : undefined));
      if (value !== undefined) {
        (resolved as Record<string, unknown>)[field] = value;
      }
    }

    return resolved;
  }, [
    effectiveExecutor,
    resolvedVariant,
    userSelections,
    scratchConfig,
    lastUsedConfig,
    presetOptions,
    variantWasUserSelected,
    selectionMode,
  ]);
}

interface UseExecutorConfigOptions {
  profiles: Record<string, ExecutorProfile> | null;
  lastUsedConfig: ExecutorConfig | null;
  scratchConfig?: ExecutorConfig | null;
  configExecutorProfile?: ExecutorProfileId | null;
  selectionMode?: ExecutorSelectionMode;
  onPersist?: (config: ExecutorConfig) => void;
}

interface UseExecutorConfigResult {
  executorConfig: ExecutorConfig | null;
  effectiveExecutor: BaseCodingAgent | null;
  selectedVariant: string | null;
  executorOptions: BaseCodingAgent[];
  variantOptions: string[];
  presetOptions: ExecutorConfig | null | undefined;
  setExecutor: (executor: BaseCodingAgent) => void;
  setVariant: (variant: string | null) => void;
  setOverrides: (partial: Partial<ExecutorConfig>) => void;
}

/** Unified executor + variant + model selector overrides management. */
export function useExecutorConfig({
  profiles,
  lastUsedConfig,
  scratchConfig,
  configExecutorProfile,
  selectionMode = 'resume',
  onPersist,
}: UseExecutorConfigOptions): UseExecutorConfigResult {
  const [userSelections, setUserSelections] = useState<Partial<ExecutorConfig>>(
    {}
  );

  const executor = useEffectiveExecutor(
    userSelections,
    profiles,
    scratchConfig,
    lastUsedConfig,
    configExecutorProfile,
    selectionMode
  );

  const variant = useEffectiveVariant(
    userSelections,
    executor.effective,
    profiles,
    scratchConfig,
    lastUsedConfig,
    configExecutorProfile,
    selectionMode
  );

  const presetLookupExecutor =
    selectionMode === 'explicit' && variant.resolved === null
      ? null
      : executor.effective;
  const { data: presetOptions } = usePresetOptions(
    presetLookupExecutor,
    variant.resolved
  );

  const executorConfig = useEffectiveOverrides(
    executor.effective,
    variant.resolved,
    userSelections,
    scratchConfig,
    lastUsedConfig,
    variant.wasUserSelected,
    presetOptions,
    selectionMode
  );

  const profileKey = getProfileKey(executor.effective, variant.resolved);
  const prevProfileKeyRef = useRef<string | null>(profileKey);
  useEffect(() => {
    const prev = prevProfileKeyRef.current;
    prevProfileKeyRef.current = profileKey;
    if (prev !== null && prev !== profileKey) {
      setUserSelections((s) => {
        const { executor, variant, ...rest } = s;
        if (Object.keys(rest).length === 0) return s;
        return { executor, variant };
      });
    }
  }, [profileKey]);

  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  const persist = useCallback((config: ExecutorConfig | null) => {
    if (config) onPersistRef.current?.(config);
  }, []);

  // Setting executor → replaces entire selections with just { executor }.
  // Clears variant + all override fields.
  const setExecutor = useCallback(
    (exec: BaseCodingAgent) => {
      setUserSelections({ executor: exec });
      if (selectionMode === 'explicit') {
        persist({ executor: exec, variant: null });
        return;
      }
      const newVariants = getVariantOptions(exec, profiles);
      const newVariant = newVariants[0] ?? null;
      persist({ executor: exec, variant: newVariant });
    },
    [profiles, persist, selectionMode]
  );

  // Setting variant → keeps executor, sets variant, clears all override fields.
  const setVariant = useCallback(
    (v: string | null) => {
      setUserSelections((prev) => ({ executor: prev.executor, variant: v }));
      if (executor.effective) {
        persist({ executor: executor.effective, variant: v });
      }
    },
    [executor.effective, persist]
  );

  // Model selector updates individual override fields (merge into existing).
  // Changing model clears reasoning selection; other overrides are independent.
  const setOverrides = useCallback(
    (partial: Partial<ExecutorConfig>) => {
      setUserSelections((prev) => {
        const next = { ...prev, ...partial };
        if ('model_id' in partial && !('reasoning_id' in partial)) {
          delete next.reasoning_id;
        }
        // Persist with current effective executor/variant
        if (executor.effective) {
          persist({
            ...next,
            executor: executor.effective,
            variant: variant.resolved,
          });
        }
        return next;
      });
    },
    [executor.effective, variant.resolved, persist]
  );

  return {
    executorConfig,
    effectiveExecutor: executor.effective,
    selectedVariant: variant.resolved,
    executorOptions: executor.options,
    variantOptions: variant.options,
    presetOptions,
    setExecutor,
    setVariant,
    setOverrides,
  };
}
