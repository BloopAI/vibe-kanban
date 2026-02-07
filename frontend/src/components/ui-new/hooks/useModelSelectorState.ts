import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  BaseCodingAgent,
  ExecutorSessionOverrides,
  ModelInfo,
  ModelSelectorConfig,
  PresetOptions,
  ReasoningOption,
} from 'shared/types';
import { PermissionPolicy } from 'shared/types';
import { useJsonPatchWsStream } from '@/hooks/useJsonPatchWsStream';
import { agentsApi } from '@/lib/api';

type ModelConfigStreamState = {
  config: ModelSelectorConfig | null;
  loading: boolean;
  error: string | null;
};

interface UseModelSelectorStateOptions {
  agent: BaseCodingAgent | null;
  workspaceId: string | undefined;
  isAttemptRunning?: boolean;
  preset?: string | null;
}

interface ModelSelectorStateResult {
  config: ModelSelectorConfig | null;
  selectedProviderId: string | null;
  selectedModelId: string | null;
  selectedAgentId: string | null;
  selectedReasoningId: string | null;
  permissionPolicy: PermissionPolicy | null;
  sessionOverrides: ExecutorSessionOverrides | null;
  handleProviderSelect: (providerId: string) => void;
  handleModelSelect: (modelId: string | null, providerId?: string) => void;
  handleAgentSelect: (id: string | null) => void;
  handleReasoningSelect: (reasoningId: string | null) => void;
  handlePermissionPolicyChange: (policy: PermissionPolicy) => void;
  permissionChangePending: boolean;
}

type LocalSelections = {
  providerId: string | null;
  modelId: string | null;
  agentId: string | null;
  reasoningId: string | null;
  permissionPolicy: PermissionPolicy | null;
};

const emptySelections: LocalSelections = {
  providerId: null,
  modelId: null,
  agentId: null,
  reasoningId: null,
  permissionPolicy: null,
};

function parseModelId(value?: string | null): {
  providerId: string | null;
  modelId: string | null;
} {
  if (!value) return { providerId: null, modelId: null };
  const parts = value.split('/');
  if (parts.length < 2) {
    return { providerId: null, modelId: value };
  }
  const [providerId, ...rest] = parts;
  return { providerId, modelId: rest.join('/') };
}

function appendPresetModel(
  config: ModelSelectorConfig | null,
  presetModel: string | null | undefined
): ModelSelectorConfig | null {
  if (!config || !presetModel) return config;
  const { providerId, modelId } = parseModelId(presetModel);
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

function resolveDefaultModelId(
  models: ModelInfo[],
  providerId: string | null,
  defaultModel: string | null | undefined
): string | null {
  if (models.length === 0) return null;
  const scoped = providerId
    ? models.filter((model) => model.provider_id === providerId)
    : models;
  if (scoped.length === 0) return null;

  const { providerId: defaultProvider, modelId: defaultId } =
    parseModelId(defaultModel);
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

function resolveDefaultReasoningId(options: ReasoningOption[]): string | null {
  return (
    options.find((option) => option.is_default)?.id ?? options[0]?.id ?? null
  );
}

export function useModelSelectorState({
  agent,
  workspaceId,
  isAttemptRunning = false,
  preset,
}: UseModelSelectorStateOptions): ModelSelectorStateResult {
  const endpoint = agent
    ? agentsApi.getModelConfigStreamUrl(agent, { workspaceId })
    : undefined;

  const initialData = useCallback(
    (): ModelConfigStreamState => ({
      config: null,
      loading: true,
      error: null,
    }),
    []
  );

  const { data, error } = useJsonPatchWsStream<ModelConfigStreamState>(
    endpoint,
    !!endpoint,
    initialData
  );

  const streamError = data?.error ?? error;

  useEffect(() => {
    if (streamError) {
      console.error('Failed to fetch model config', streamError);
    }
  }, [streamError]);

  const { data: presetOptions } = useQuery({
    queryKey: ['preset-options', agent, preset ?? null],
    queryFn: async (): Promise<PresetOptions | null> => {
      if (!agent) return null;
      return agentsApi.getPresetOptions({
        executor: agent,
        variant: preset ?? null,
      });
    },
    enabled: !!agent,
    staleTime: 1000 * 60 * 5,
  });

  const baseConfig = data?.config ?? null;
  const config = appendPresetModel(baseConfig, presetOptions?.model_id);

  const [local, setLocal] = useState<LocalSelections>(emptySelections);

  const presetKey = agent ? `${agent}:${preset ?? 'DEFAULT'}` : null;

  useEffect(() => {
    if (!presetKey) return;
    setLocal(emptySelections);
  }, [presetKey]);

  const { providerId: presetProviderId, modelId: presetModelId } = parseModelId(
    presetOptions?.model_id
  );

  const availableProviderIds = config?.providers.map((item) => item.id) ?? [];
  const fallbackProviderId = availableProviderIds[0] ?? null;
  const resolvedPresetProviderId =
    presetProviderId && availableProviderIds.includes(presetProviderId)
      ? presetProviderId
      : null;

  const hasDefaultModel = Boolean(config?.default_model);
  const selectedProviderId =
    local.providerId ??
    resolvedPresetProviderId ??
    (hasDefaultModel ? fallbackProviderId : null);

  const defaultModelId = config
    ? resolveDefaultModelId(
        config.models,
        selectedProviderId,
        config.default_model
      )
    : null;

  const presetModelMatchesProvider =
    !selectedProviderId ||
    !presetProviderId ||
    presetProviderId === selectedProviderId;
  const resolvedPresetModelId = presetModelMatchesProvider
    ? presetModelId
    : null;

  const selectedModelId =
    local.modelId ?? resolvedPresetModelId ?? defaultModelId;

  const selectedModel = config?.models.find(
    (model) => model.id === selectedModelId
  );

  const presetReasoningId =
    resolvedPresetModelId && selectedModelId === resolvedPresetModelId
      ? (presetOptions?.reasoning_id ?? null)
      : null;

  const selectedReasoningId =
    local.reasoningId ??
    presetReasoningId ??
    resolveDefaultReasoningId(selectedModel?.reasoning_options ?? []);

  const defaultAgentId =
    config?.agents.find((entry) => entry.is_default)?.id ??
    config?.agents[0]?.id ??
    null;

  const selectedAgentId =
    local.agentId ?? presetOptions?.agent_id ?? defaultAgentId;

  const supportsPermissions = (config?.permissions.length ?? 0) > 0;

  const basePermissionPolicy = supportsPermissions
    ? (presetOptions?.permission_policy ?? config?.permissions[0] ?? null)
    : null;
  const permissionPolicy = supportsPermissions
    ? (local.permissionPolicy ?? basePermissionPolicy)
    : null;

  const permissionChangePending = Boolean(
    supportsPermissions &&
      isAttemptRunning &&
      local.permissionPolicy &&
      basePermissionPolicy &&
      local.permissionPolicy !== basePermissionPolicy
  );

  const handleProviderSelect = (providerId: string) => {
    setLocal((prev) => ({
      ...prev,
      providerId,
      modelId: null,
      reasoningId: null,
    }));
  };

  const handleModelSelect = (modelId: string | null, providerId?: string) => {
    setLocal((prev) => ({
      ...prev,
      ...(providerId ? { providerId } : {}),
      modelId,
      reasoningId: null,
    }));
  };

  const handleAgentSelect = (id: string | null) => {
    setLocal((prev) => ({ ...prev, agentId: id }));
  };

  const handleReasoningSelect = (reasoningId: string | null) => {
    setLocal((prev) => ({ ...prev, reasoningId }));
  };

  const handlePermissionPolicyChange = (policy: PermissionPolicy) => {
    if (!supportsPermissions) return;
    const newPolicy =
      basePermissionPolicy && policy === basePermissionPolicy ? null : policy;
    setLocal((prev) => ({ ...prev, permissionPolicy: newPolicy }));
  };

  const sessionOverrides = useMemo((): ExecutorSessionOverrides | null => {
    const modelOverride = (() => {
      if (!local.modelId) return null;
      if (
        agent === 'OPENCODE' &&
        selectedProviderId &&
        !local.modelId.includes('/')
      ) {
        return `${selectedProviderId}/${local.modelId}`;
      }
      return local.modelId;
    })();

    if (
      !modelOverride &&
      !local.agentId &&
      !local.reasoningId &&
      !local.permissionPolicy
    ) {
      return null;
    }

    return {
      ...(modelOverride ? { model_id: modelOverride } : {}),
      ...(local.agentId ? { agent_id: local.agentId } : {}),
      ...(local.reasoningId ? { reasoning_id: local.reasoningId } : {}),
      ...(supportsPermissions && local.permissionPolicy
        ? { permission_policy: local.permissionPolicy }
        : {}),
    };
  }, [agent, local, selectedProviderId, supportsPermissions]);

  return {
    config,
    selectedProviderId,
    selectedModelId,
    selectedAgentId,
    selectedReasoningId,
    permissionPolicy,
    sessionOverrides,
    handleProviderSelect,
    handleModelSelect,
    handleAgentSelect,
    handleReasoningSelect,
    handlePermissionPolicyChange,
    permissionChangePending,
  };
}
