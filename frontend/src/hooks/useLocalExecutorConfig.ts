import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BaseCodingAgent,
  ExecutorConfig,
  ExecutorProfile,
  ExecutorProfileId,
} from 'shared/types';
import { getVariantOptions } from '@/utils/executor';

const OVERRIDE_FIELDS = [
  'model_id',
  'agent_id',
  'reasoning_id',
  'permission_policy',
] as const;

function getExecutorOptions(
  profiles: Record<string, ExecutorProfile> | null
): BaseCodingAgent[] {
  return Object.keys(profiles ?? {}) as BaseCodingAgent[];
}

function pickVariant(
  executor: BaseCodingAgent,
  profiles: Record<string, ExecutorProfile> | null,
  preferredVariant: string | null
): string | null {
  const options = getVariantOptions(executor, profiles);
  if (preferredVariant && options.includes(preferredVariant)) {
    return preferredVariant;
  }
  return (options.includes('DEFAULT') ? 'DEFAULT' : options[0]) ?? null;
}

interface UseLocalExecutorConfigOptions {
  profiles: Record<string, ExecutorProfile> | null;
  initialConfig: ExecutorConfig | null | undefined;
  preferredProfile: ExecutorProfileId | null | undefined;
  lockedExecutor?: BaseCodingAgent | null;
  onPersist?: (config: ExecutorConfig) => void;
  resetKey?: string | null;
}

interface UseLocalExecutorConfigResult {
  executorConfig: ExecutorConfig | null;
  effectiveExecutor: BaseCodingAgent | null;
  selectedVariant: string | null;
  executorOptions: BaseCodingAgent[];
  variantOptions: string[];
  setExecutor: (executor: BaseCodingAgent) => void;
  setVariant: (variant: string | null) => void;
  setOverrides: (partial: Partial<ExecutorConfig>) => void;
}

export function useLocalExecutorConfig({
  profiles,
  initialConfig,
  preferredProfile,
  lockedExecutor = null,
  onPersist,
  resetKey,
}: UseLocalExecutorConfigOptions): UseLocalExecutorConfigResult {
  const [localConfig, setLocalConfig] = useState<ExecutorConfig | null>(null);

  useEffect(() => {
    setLocalConfig(null);
  }, [resetKey]);

  const normalizeConfig = useCallback(
    (config: ExecutorConfig | null | undefined): ExecutorConfig | null => {
      const executorOptions = getExecutorOptions(profiles);
      if (executorOptions.length === 0) return null;

      const executor =
        (lockedExecutor && executorOptions.includes(lockedExecutor)
          ? lockedExecutor
          : null) ??
        (config?.executor && executorOptions.includes(config.executor)
          ? config.executor
          : null) ??
        (preferredProfile?.executor &&
        executorOptions.includes(preferredProfile.executor)
          ? preferredProfile.executor
          : null) ??
        executorOptions[0] ??
        null;

      if (!executor) return null;

      const variantOptions = getVariantOptions(executor, profiles);
      const configVariant =
        config?.executor === executor ? (config.variant ?? null) : null;
      const preferredVariant =
        preferredProfile?.executor === executor
          ? (preferredProfile.variant ?? null)
          : null;
      const variant =
        (configVariant && variantOptions.includes(configVariant)
          ? configVariant
          : null) ??
        (preferredVariant && variantOptions.includes(preferredVariant)
          ? preferredVariant
          : null) ??
        (variantOptions.includes('DEFAULT') ? 'DEFAULT' : variantOptions[0]) ??
        null;

      const resolved: ExecutorConfig = { executor, variant };

      if (
        config?.executor === executor &&
        (config.variant ?? null) === (variant ?? null)
      ) {
        for (const field of OVERRIDE_FIELDS) {
          const value = config[field];
          if (value !== undefined) {
            (resolved as Record<string, unknown>)[field] = value;
          }
        }
      }

      return resolved;
    },
    [profiles, preferredProfile, lockedExecutor]
  );

  const executorConfig = useMemo(() => {
    if (!profiles) return null;
    if (localConfig) return normalizeConfig(localConfig);
    if (initialConfig === undefined) return null;
    return normalizeConfig(initialConfig);
  }, [profiles, localConfig, initialConfig, normalizeConfig]);

  const effectiveExecutor = executorConfig?.executor ?? null;
  const selectedVariant = executorConfig?.variant ?? null;
  const executorOptions = useMemo(
    () => getExecutorOptions(profiles),
    [profiles]
  );
  const variantOptions = useMemo(
    () => getVariantOptions(effectiveExecutor, profiles),
    [effectiveExecutor, profiles]
  );

  const persist = useCallback(
    (next: ExecutorConfig | null) => {
      if (next) onPersist?.(next);
    },
    [onPersist]
  );

  const setExecutor = useCallback(
    (executor: BaseCodingAgent) => {
      if (lockedExecutor && executor !== lockedExecutor) return;

      const nextVariant = pickVariant(
        executor,
        profiles,
        preferredProfile?.executor === executor
          ? (preferredProfile.variant ?? null)
          : null
      );
      const next: ExecutorConfig = { executor, variant: nextVariant };
      setLocalConfig(next);
      persist(next);
    },
    [lockedExecutor, profiles, preferredProfile, persist]
  );

  const setVariant = useCallback(
    (variant: string | null) => {
      if (!executorConfig) return;
      const next = normalizeConfig({ ...executorConfig, variant });
      if (!next) return;
      setLocalConfig(next);
      persist(next);
    },
    [executorConfig, normalizeConfig, persist]
  );

  const setOverrides = useCallback(
    (partial: Partial<ExecutorConfig>) => {
      if (!executorConfig) return;

      const merged: ExecutorConfig = { ...executorConfig, ...partial };
      if ('model_id' in partial && !('reasoning_id' in partial)) {
        delete merged.reasoning_id;
      }
      if (lockedExecutor) {
        merged.executor = lockedExecutor;
      }

      const next = normalizeConfig(merged);
      if (!next) return;
      setLocalConfig(next);
      persist(next);
    },
    [executorConfig, lockedExecutor, normalizeConfig, persist]
  );

  return {
    executorConfig,
    effectiveExecutor,
    selectedVariant,
    executorOptions,
    variantOptions,
    setExecutor,
    setVariant,
    setOverrides,
  };
}
