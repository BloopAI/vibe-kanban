import type { BaseCodingAgent, ExecutorConfig, ModelInfo } from 'shared/types';

type ProfilesMap = Record<string, ExecutorConfig> | null;

export function getModelPinKey(model: ModelInfo): string {
  return model.provider_id ? `${model.provider_id}/${model.id}` : model.id;
}

export function isPinnedModel(
  pinnedSet: Set<string>,
  model: ModelInfo
): boolean {
  const key = getModelPinKey(model).toLowerCase();
  if (pinnedSet.has(key)) return true;
  if (model.provider_id) return false;
  return pinnedSet.has(model.id.toLowerCase());
}

export function getPinnedModelEntries(
  profiles: ProfilesMap,
  executor: BaseCodingAgent | null
): string[] {
  if (!profiles || !executor) return [];
  const entries = profiles[executor]?.pinned_models?.models ?? [];
  return entries.map((e) => e.trim()).filter(Boolean);
}

export function togglePinnedModelEntry(
  entries: string[],
  model: ModelInfo
): string[] {
  const normalized = entries.map((e) => e.trim()).filter(Boolean);
  const key = getModelPinKey(model);
  const keyLower = key.toLowerCase();

  const filtered = normalized.filter((e) => {
    const lower = e.toLowerCase();
    if (lower === keyLower) return false;
    if (!model.provider_id && lower === model.id.toLowerCase()) return false;
    return true;
  });

  if (filtered.length !== normalized.length) return filtered;
  return [key, ...filtered];
}

export function updatePinnedModelEntries(
  profiles: Record<string, ExecutorConfig>,
  executor: BaseCodingAgent,
  entries: string[]
): Record<string, ExecutorConfig> {
  const normalized = entries.map((e) => e.trim()).filter(Boolean);
  const pinnedModels = normalized.length > 0 ? { models: normalized } : null;
  const existingConfig = profiles[executor] ?? {};

  return {
    ...profiles,
    [executor]: {
      ...existingConfig,
      pinned_models: pinnedModels,
    } as ExecutorConfig,
  };
}

export function getPinnedProviderIds(
  models: ModelInfo[],
  pinnedModelIds: string[]
): string[] {
  if (pinnedModelIds.length === 0) return [];
  const pinnedSet = new Set(pinnedModelIds.map((e) => e.toLowerCase()));
  const ids = new Set<string>();

  for (const model of models) {
    if (model.provider_id && isPinnedModel(pinnedSet, model)) {
      ids.add(model.provider_id);
    }
  }

  return Array.from(ids);
}
