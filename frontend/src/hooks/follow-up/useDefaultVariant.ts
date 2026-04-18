import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ExecutorAction,
  ExecutorConfig,
  ExecutionProcess,
  ExecutorProfileId,
} from 'shared/types';

type Args = {
  processes: ExecutionProcess[];
  profiles?: Record<string, ExecutorConfig> | null;
};

/**
 * Extract the model name from a variant configuration.
 * @param profiles - The executor profiles configuration
 * @param executor - The executor name (e.g., "CLAUDE_CODE")
 * @param variant - The variant name (e.g., "sonnet", "opus") or null for DEFAULT
 * @returns The model name or null if not found
 */
function getModelFromVariantConfig(
  profiles: Record<string, ExecutorConfig> | null,
  executor: string,
  variant: string | null
): string | null {
  if (!profiles || !executor) return null;

  const executorConfig = profiles[executor];
  if (!executorConfig) return null;

  // Handle DEFAULT variant or null variant
  const variantKey = variant ?? 'DEFAULT';
  const variantConfig = executorConfig[variantKey];
  if (!variantConfig) return null;

  // Extract model from the variant config
  // The config is a union like { "CLAUDE_CODE": ClaudeCode } | { "GEMINI": Gemini } ...
  // We need to get the actual config object
  // Use a type assertion to access the executor key dynamically
  const configValue = (variantConfig as Record<string, unknown>)[executor];
  if (!configValue || typeof configValue !== 'object') return null;

  // TypeScript doesn't know the exact type, but we know they all have model?: string | null
  return (configValue as { model?: string | null }).model ?? null;
}

export function useDefaultVariant({ processes, profiles }: Args) {
  const latestProfileId = useMemo<ExecutorProfileId | null>(() => {
    if (!processes?.length) return null;

    // Walk processes from newest to oldest and extract the first executor_profile_id
    // from either the action itself or its next_action (when current is a ScriptRequest).
    const extractProfile = (
      action: ExecutorAction | null
    ): ExecutorProfileId | null => {
      let curr: ExecutorAction | null = action;
      while (curr) {
        const typ = curr.typ;
        switch (typ.type) {
          case 'CodingAgentInitialRequest':
          case 'CodingAgentFollowUpRequest':
            return typ.executor_profile_id;
          case 'ScriptRequest':
            curr = curr.next_action;
            continue;
        }
      }
      return null;
    };
    return (
      processes
        .slice()
        .reverse()
        .map((p) => extractProfile(p.executor_action ?? null))
        .find((pid) => pid !== null) ?? null
    );
  }, [processes]);

  const defaultFollowUpVariant = latestProfileId?.variant ?? null;

  const [selectedVariant, setSelectedVariant] = useState<string | null>(
    defaultFollowUpVariant
  );
  useEffect(
    () => setSelectedVariant(defaultFollowUpVariant),
    [defaultFollowUpVariant]
  );

  const currentProfile = useMemo(() => {
    if (!latestProfileId) return null;
    return profiles?.[latestProfileId.executor] ?? null;
  }, [latestProfileId, profiles]);

  // Memo to store previous variant and model information
  const previousVariantInfo = useMemo(
    () => ({
      variant: latestProfileId?.variant ?? 'DEFAULT',
      model: latestProfileId
        ? getModelFromVariantConfig(
            profiles ?? null,
            latestProfileId.executor,
            latestProfileId.variant
          )
        : null,
    }),
    [latestProfileId, profiles]
  );

  // Callback to check if selecting a new variant would change the model
  const wouldModelChange = useCallback(
    (newVariant: string | null): boolean => {
      if (!latestProfileId) return false;

      const previousModel = previousVariantInfo.model;
      const newModel = getModelFromVariantConfig(
        profiles ?? null,
        latestProfileId.executor,
        newVariant
      );

      // If either model is null, consider it not a change (can't determine)
      if (!previousModel || !newModel) return false;

      return previousModel !== newModel;
    },
    [latestProfileId, profiles, previousVariantInfo.model]
  );

  return {
    selectedVariant,
    setSelectedVariant,
    currentProfile,
    currentExecutor: latestProfileId?.executor ?? null,
    wouldModelChange,
    previousVariantInfo,
  } as const;
}
