import type {
  ExecutorConfig,
  ModelInfo,
  ModelSelectorConfig,
  ReasoningOption,
} from 'shared/types';
import { PermissionPolicy } from 'shared/types';

function toPrettyCase(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function getSelectedModel(
  models: ModelInfo[],
  selectedProviderId: string | null,
  selectedModelId: string | null
): ModelInfo | null {
  if (!selectedModelId) return null;
  const selectedId = selectedModelId.toLowerCase();
  if (selectedProviderId) {
    const providerId = selectedProviderId.toLowerCase();
    return (
      models.find(
        (model) =>
          model.id.toLowerCase() === selectedId &&
          model.provider_id?.toLowerCase() === providerId
      ) ?? null
    );
  }
  return models.find((model) => model.id.toLowerCase() === selectedId) ?? null;
}

export function getReasoningLabel(
  options: ReasoningOption[],
  selectedId: string | null
): string | null {
  if (!selectedId) return null;
  return (
    options.find((option) => option.id === selectedId)?.label ??
    toPrettyCase(selectedId)
  );
}

export function escapeAttributeValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

export function parseModelId(
  value?: string | null,
  hasProviders?: boolean
): {
  providerId: string | null;
  modelId: string | null;
} {
  if (!value) return { providerId: null, modelId: null };
  if (!hasProviders) return { providerId: null, modelId: value };
  const slashIdx = value.indexOf('/');
  if (slashIdx === -1) return { providerId: null, modelId: value };
  return {
    providerId: value.substring(0, slashIdx),
    modelId: value.substring(slashIdx + 1),
  };
}

/**
 * Adds a preset model missing from the list, so it can still be shown.
 * Skipped once the list is complete (live): a missing model is unavailable.
 */
export function appendPresetModel(
  config: ModelSelectorConfig | null,
  presetModel: string | null | undefined,
  modelsComplete = false
): ModelSelectorConfig | null {
  if (!config || !presetModel || modelsComplete) return config;
  const hasProviders = config.providers.length > 0;
  const { providerId, modelId } = parseModelId(presetModel, hasProviders);
  if (!modelId) return config;

  const exists = config.models.some(
    (m) =>
      m.id.toLowerCase() === modelId.toLowerCase() &&
      (!providerId || m.provider_id?.toLowerCase() === providerId.toLowerCase())
  );
  if (exists) return config;

  return {
    ...config,
    models: [
      {
        id: modelId,
        name: modelId,
        provider_id: providerId,
        reasoning_options: [],
      },
      ...config.models,
    ],
  };
}

export function resolveDefaultModelId(
  models: ModelInfo[],
  providerId: string | null,
  defaultModel: string | null | undefined,
  hasProviders?: boolean
): string | null {
  if (models.length === 0) return null;
  const scoped = providerId
    ? models.filter((model) => model.provider_id === providerId)
    : models;
  if (scoped.length === 0) return null;

  const { providerId: defaultProvider, modelId: defaultId } = parseModelId(
    defaultModel,
    hasProviders
  );
  if (
    defaultId &&
    (!providerId || !defaultProvider || providerId === defaultProvider)
  ) {
    const match = scoped.find((model) => model.id === defaultId);
    if (match) return match.id;
  }

  if (!defaultModel) return null;

  return scoped[0]?.id ?? null;
}

export function isModelAvailable(
  config: ModelSelectorConfig,
  providerId: string,
  modelId: string
): boolean {
  const providerLower = providerId.toLowerCase();
  const modelLower = modelId.toLowerCase();
  return config.models.some(
    (model) =>
      model.id.toLowerCase() === modelLower &&
      model.provider_id?.toLowerCase() === providerLower
  );
}

export function resolveDefaultReasoningId(
  options: ReasoningOption[]
): string | null {
  return (
    options.find((option) => option.is_default)?.id ?? options[0]?.id ?? null
  );
}

/**
 * Once the list is complete, a model that isn't in it is unavailable, so the
 * agent's default is shown instead (null means "Default").
 */
export function dropUnavailableModel(
  models: ModelInfo[],
  providerId: string | null,
  modelId: string | null,
  modelsComplete: boolean
): string | null {
  if (!modelId || !modelsComplete) return modelId;
  return getSelectedModel(models, providerId, modelId) ? modelId : null;
}

/**
 * The permission to show. Once the list is complete, one that isn't offered
 * shows as Ask (or the first option without Ask), never as Auto, matching the
 * server, which runs an unavailable Plan as Ask.
 */
export function resolvePermissionPolicy(
  permissions: PermissionPolicy[],
  selected: PermissionPolicy | null | undefined,
  modelsComplete: boolean
): PermissionPolicy | null {
  if (permissions.length === 0) return null;
  if (!selected) return permissions[0];
  if (!modelsComplete || permissions.includes(selected)) return selected;
  if (permissions.includes(PermissionPolicy.SUPERVISED)) {
    return PermissionPolicy.SUPERVISED;
  }
  return permissions.find((p) => p !== PermissionPolicy.AUTO) ?? null;
}

/**
 * Saved selections the live list no longer offers, with what to reset them to.
 * Profile values are kept, so the run still warns and points to Settings.
 */
export function staleSelections(
  config: ModelSelectorConfig,
  selected: ExecutorConfig,
  preset: ExecutorConfig | null | undefined,
  modelsComplete: boolean
): Partial<ExecutorConfig> {
  if (!modelsComplete) return {};
  const reset: Partial<ExecutorConfig> = {};

  if (selected.model_id && selected.model_id !== preset?.model_id) {
    const { providerId, modelId } = parseModelId(
      selected.model_id,
      config.providers.length > 0
    );
    if (!getSelectedModel(config.models, providerId, modelId)) {
      reset.model_id = null;
    }
  }

  const policy = selected.permission_policy;
  if (
    policy &&
    policy !== preset?.permission_policy &&
    !config.permissions.includes(policy)
  ) {
    const fallback = resolvePermissionPolicy(config.permissions, policy, true);
    if (fallback) reset.permission_policy = fallback;
  }

  return reset;
}
