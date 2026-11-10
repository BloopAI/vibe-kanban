import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckIcon,
  FastForwardIcon,
  GearIcon,
  HandIcon,
  ListBulletsIcon,
  SlidersHorizontalIcon,
  type Icon,
} from '@phosphor-icons/react';
import type { BaseCodingAgent, ExecutorConfig, ModelInfo } from 'shared/types';
import { PermissionPolicy } from 'shared/types';
import { toPrettyCase } from '@/shared/lib/string';
import {
  getModelKey,
  getRecentModelEntries,
  getRecentReasoning,
  getRecentReasoningByModel,
  touchRecentModel,
  updateRecentModelEntries,
  setRecentReasoning,
} from '@/shared/lib/recentModels';
import {
  getReasoningLabel,
  getSelectedModel,
  escapeAttributeValue,
  parseModelId,
  appendPresetModel,
  resolveDefaultModelId,
  isModelAvailable,
  resolveDefaultReasoningId,
  dropUnavailableModel,
  resolvePermissionPolicy,
  staleSelections,
} from '@/shared/lib/modelSelector';
import { profilesApi } from '@/shared/lib/api';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { getResolvedTheme, useTheme } from '@/shared/hooks/useTheme';
import { useModelSelectorConfig } from '@/shared/hooks/useExecutorDiscovery';
import { ModelSelectorPopover } from '@vibe/ui/components/ModelSelectorPopover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTriggerButton,
} from '@vibe/ui/components/Dropdown';

interface ModelSelectorContainerProps {
  agent: BaseCodingAgent | null;
  workspaceId: string | undefined;
  sessionId?: string;
  onAdvancedSettings: () => void;
  presets: string[];
  selectedPreset: string | null;
  onPresetSelect: (presetId: string | null) => void;
  onOverrideChange: (partial: Partial<ExecutorConfig>) => void;
  executorConfig: ExecutorConfig | null;
  presetOptions: ExecutorConfig | null | undefined;
}

export function ModelSelectorContainer({
  agent,
  workspaceId,
  sessionId,
  onAdvancedSettings,
  presets,
  selectedPreset,
  onPresetSelect,
  onOverrideChange,
  executorConfig,
  presetOptions,
}: ModelSelectorContainerProps) {
  const { t } = useTranslation('common');
  const { theme } = useTheme();
  const resolvedTheme = getResolvedTheme(theme);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProviderId, setExpandedProviderId] = useState('');
  const { profiles, setProfiles, reloadSystem } = useUserSystem();
  const defaultLabel = t('modelSelector.default');
  const loadingLabel = t('states.loading');

  const permissionMetaByPolicy: Record<
    PermissionPolicy,
    { label: string; icon: Icon }
  > = {
    [PermissionPolicy.AUTO]: {
      label: t('modelSelector.permissionAuto'),
      icon: FastForwardIcon,
    },
    [PermissionPolicy.SUPERVISED]: {
      label: t('modelSelector.permissionAsk'),
      icon: HandIcon,
    },
    [PermissionPolicy.PLAN]: {
      label: t('modelSelector.permissionPlan'),
      icon: ListBulletsIcon,
    },
  };

  const resolvedPreset =
    selectedPreset ??
    (presets.includes('DEFAULT') ? 'DEFAULT' : (presets[0] ?? null));

  const {
    config: streamConfig,
    loadingModels,
    modelsComplete,
    error: streamError,
  } = useModelSelectorConfig(agent, {
    workspaceId: sessionId ? workspaceId : undefined,
    sessionId,
  });

  useEffect(() => {
    if (streamError) {
      console.error('Failed to fetch model config', streamError);
    }
  }, [streamError]);

  const baseConfig = streamConfig;
  const config = appendPresetModel(
    baseConfig,
    presetOptions?.model_id,
    modelsComplete
  );

  const availableProviderIds = useMemo(
    () => config?.providers.map((item) => item.id) ?? [],
    [config?.providers]
  );
  const hasProviders = availableProviderIds.length > 0;
  const providerIdMap = useMemo(
    () => new Map(availableProviderIds.map((id) => [id.toLowerCase(), id])),
    [availableProviderIds]
  );
  const resolveProviderId = (value?: string | null) =>
    value ? (providerIdMap.get(value.toLowerCase()) ?? null) : null;

  const { providerId: configProviderId, modelId: configModelId } = useMemo(
    () => parseModelId(executorConfig?.model_id, hasProviders),
    [executorConfig?.model_id, hasProviders]
  );

  const fallbackProviderId = availableProviderIds[0] ?? null;
  const resolvedConfigProviderId = resolveProviderId(configProviderId);

  const { providerId: presetProviderId } = useMemo(
    () => parseModelId(presetOptions?.model_id, hasProviders),
    [presetOptions?.model_id, hasProviders]
  );
  const resolvedPresetProviderId = resolveProviderId(presetProviderId);

  const hasDefaultModel = Boolean(config?.default_model);
  const selectedProviderId =
    resolvedConfigProviderId ??
    resolvedPresetProviderId ??
    (hasDefaultModel ? fallbackProviderId : null);

  const defaultModelId = config
    ? resolveDefaultModelId(
        config.models,
        selectedProviderId,
        config.default_model,
        hasProviders
      )
    : null;

  const { modelId: presetModelId } = useMemo(
    () => parseModelId(presetOptions?.model_id, hasProviders),
    [presetOptions?.model_id, hasProviders]
  );

  const presetModelMatchesProvider =
    !selectedProviderId ||
    !resolvedPresetProviderId ||
    resolvedPresetProviderId === selectedProviderId;
  const resolvedPresetModelId = presetModelMatchesProvider
    ? presetModelId
    : null;

  const selectedModelId = (() => {
    const candidate = configModelId ?? resolvedPresetModelId ?? defaultModelId;
    if (!candidate || !config) return candidate;
    if (!selectedProviderId) {
      return dropUnavailableModel(
        config.models,
        null,
        candidate,
        modelsComplete
      );
    }
    const hasMatch = isModelAvailable(config, selectedProviderId, candidate);
    return hasMatch
      ? candidate
      : resolveDefaultModelId(
          config.models,
          selectedProviderId,
          config.default_model,
          hasProviders
        );
  })();

  const selectedModel = config
    ? getSelectedModel(config.models, selectedProviderId, selectedModelId)
    : null;

  const recentReasoningByModel = getRecentReasoningByModel(profiles, agent);

  // Shows only what the run sends: a remembered reasoning is applied when its
  // model is picked (handleModelSelect), not just displayed.
  const selectedReasoningId =
    executorConfig?.reasoning_id !== undefined
      ? executorConfig.reasoning_id
      : resolveDefaultReasoningId(selectedModel?.reasoning_options ?? []);

  const defaultAgentId =
    config?.agents.find((entry) => entry.is_default)?.id ?? null;

  const selectedAgentId =
    executorConfig?.agent_id !== undefined
      ? executorConfig.agent_id
      : (presetOptions?.agent_id ?? defaultAgentId);

  const supportsPermissions = (config?.permissions.length ?? 0) > 0;

  const permissionPolicy = resolvePermissionPolicy(
    config?.permissions ?? [],
    executorConfig?.permission_policy ?? presetOptions?.permission_policy,
    modelsComplete
  );

  // Once the live list is in, reset last-used selections it no longer offers,
  // so the run doesn't send them and warn. Waits for the preset, whose values
  // are kept.
  useEffect(() => {
    if (!streamConfig || !executorConfig || presetOptions === undefined) return;
    const reset = staleSelections(
      streamConfig,
      executorConfig,
      presetOptions,
      modelsComplete
    );
    if (Object.keys(reset).length > 0) onOverrideChange(reset);
  }, [
    streamConfig,
    executorConfig,
    presetOptions,
    modelsComplete,
    onOverrideChange,
  ]);

  // LRU persistence (on popover close)

  const recentModelEntries = getRecentModelEntries(profiles, agent);
  const pendingModelRef = useRef<ModelInfo | null>(null);
  // undefined: nothing to save; null: "Default" was picked, so forget the model's reasoning
  const pendingReasoningRef = useRef<string | null | undefined>(undefined);

  const persistPendingSelections = useCallback(() => {
    if (!profiles || !agent) return;
    if (!pendingModelRef.current && pendingReasoningRef.current === undefined)
      return;

    let nextProfiles = profiles;

    const model = pendingModelRef.current;
    if (model) {
      pendingModelRef.current = null;
      const current = getRecentModelEntries(nextProfiles, agent);
      const nextEntries = touchRecentModel(current, model);
      nextProfiles = updateRecentModelEntries(nextProfiles, agent, nextEntries);
    }

    const reasoningModel =
      model ??
      (selectedModelId && config
        ? getSelectedModel(config.models, selectedProviderId, selectedModelId)
        : null);
    if (pendingReasoningRef.current !== undefined && reasoningModel) {
      nextProfiles = setRecentReasoning(
        nextProfiles,
        agent,
        reasoningModel,
        pendingReasoningRef.current
      );
      pendingReasoningRef.current = undefined;
    }

    if (nextProfiles !== profiles) {
      setProfiles(nextProfiles);
      void profilesApi
        .save(JSON.stringify({ executors: nextProfiles }, null, 2))
        .catch((error) => {
          console.error('Failed to save recent models', error);
          void reloadSystem();
        });
    }
  }, [
    agent,
    config,
    profiles,
    reloadSystem,
    selectedModelId,
    selectedProviderId,
    setProfiles,
  ]);

  const handleModelSelect = (modelId: string | null, providerId?: string) => {
    const modelOverride = (() => {
      if (!modelId) return null;
      if (providerId) return `${providerId}/${modelId}`;
      return modelId;
    })();

    const model =
      modelId && config
        ? (() => {
            const selectedId = modelId.toLowerCase();
            if (!providerId) {
              return (
                config.models.find((m) => m.id.toLowerCase() === selectedId) ??
                null
              );
            }
            const provider = providerId.toLowerCase();
            return (
              config.models.find(
                (m) =>
                  m.id.toLowerCase() === selectedId &&
                  m.provider_id?.toLowerCase() === provider
              ) ?? null
            );
          })()
        : null;

    // Restore the reasoning last picked for this model; otherwise the change
    // clears it and the agent's default applies.
    const recentReasoning = model
      ? getRecentReasoning(recentReasoningByModel, model)
      : null;
    onOverrideChange(
      recentReasoning
        ? { model_id: modelOverride, reasoning_id: recentReasoning }
        : { model_id: modelOverride }
    );

    pendingModelRef.current = model;
    pendingReasoningRef.current = undefined;
  };

  const handleReasoningSelect = (reasoningId: string | null) => {
    onOverrideChange({ reasoning_id: reasoningId });
    pendingReasoningRef.current = reasoningId;
  };

  const handleAgentSelect = (id: string | null) => {
    onOverrideChange({ agent_id: id });
  };

  const handlePermissionPolicyChange = (policy: PermissionPolicy) => {
    if (!supportsPermissions) return;
    onOverrideChange({ permission_policy: policy });
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSearchQuery('');
  }, [selectedProviderId]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      if (selectedModelId && config) {
        const selected = getSelectedModel(
          config.models,
          selectedProviderId,
          selectedModelId
        );
        if (selected) {
          const key = getModelKey(selected);
          const selector = `[data-model-key="${escapeAttributeValue(key)}"]`;
          const target = node.querySelector(selector);
          if (target instanceof HTMLElement) {
            target.scrollIntoView({ block: 'nearest' });
            return;
          }
        }
      }
      if (!selectedModelId) {
        node.scrollTop = node.scrollHeight;
      }
    });
  }, [config, isOpen, selectedModelId, selectedProviderId]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      const selected =
        selectedModelId && config
          ? getSelectedModel(config.models, selectedProviderId, selectedModelId)
          : null;
      setExpandedProviderId(selected?.provider_id ?? selectedProviderId ?? '');
    } else {
      persistPendingSelections();
    }
  };

  useEffect(() => {
    if (isOpen) return;
    persistPendingSelections();
  }, [isOpen, persistPendingSelections]);

  const presetLabel = resolvedPreset
    ? toPrettyCase(resolvedPreset)
    : defaultLabel;

  if (!config) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTriggerButton size="sm" label={loadingLabel} disabled />
        </DropdownMenu>
      </>
    );
  }

  const showModelSelector = loadingModels || config.models.length > 0;
  // While the list loads, "Default" stays selectable so a run can start.
  const showDefaultOption =
    !config.default_model && (loadingModels || config.models.length > 0);
  const displaySelectedModel = showModelSelector
    ? getSelectedModel(config.models, selectedProviderId, selectedModelId)
    : null;
  const reasoningLabel = displaySelectedModel
    ? getReasoningLabel(
        displaySelectedModel.reasoning_options,
        selectedReasoningId
      )
    : null;
  const modelLabelBase =
    displaySelectedModel?.name ?? selectedModelId ?? defaultLabel;
  const modelLabel = reasoningLabel
    ? `${modelLabelBase} · ${reasoningLabel}`
    : modelLabelBase;

  const agentLabel = selectedAgentId
    ? (config.agents.find((entry) => entry.id === selectedAgentId)?.label ??
      toPrettyCase(selectedAgentId))
    : defaultLabel;

  const permissionMeta = permissionPolicy
    ? (permissionMetaByPolicy[permissionPolicy] ?? null)
    : null;
  const permissionIcon = permissionMeta?.icon ?? HandIcon;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTriggerButton
          size="sm"
          icon={SlidersHorizontalIcon}
          label={
            resolvedPreset?.toLowerCase() !== 'default'
              ? presetLabel
              : undefined
          }
          showCaret={false}
        />
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t('modelSelector.preset')}</DropdownMenuLabel>
          {presets.length > 0 ? (
            presets.map((preset) => (
              <DropdownMenuItem
                key={preset}
                icon={preset === resolvedPreset ? CheckIcon : undefined}
                onClick={() => onPresetSelect?.(preset)}
              >
                {toPrettyCase(preset)}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>{presetLabel}</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={GearIcon} onClick={onAdvancedSettings}>
            {t('modelSelector.custom')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showModelSelector && (
        <ModelSelectorPopover
          isOpen={isOpen}
          onOpenChange={handleOpenChange}
          trigger={<DropdownMenuTriggerButton size="sm" label={modelLabel} />}
          config={config}
          error={streamError}
          selectedProviderId={selectedProviderId}
          selectedModelId={selectedModelId}
          selectedReasoningId={selectedReasoningId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onModelSelect={handleModelSelect}
          onReasoningSelect={handleReasoningSelect}
          recentModelEntries={recentModelEntries}
          showDefaultOption={showDefaultOption}
          // The agent's own list, not the preset model appended to it
          loading={loadingModels && (streamConfig?.models.length ?? 0) === 0}
          onSelectDefault={() => handleModelSelect(null)}
          scrollRef={scrollRef}
          expandedProviderId={expandedProviderId}
          onExpandedProviderIdChange={setExpandedProviderId}
          resolvedTheme={resolvedTheme}
        />
      )}

      {permissionPolicy && config.permissions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTriggerButton
            size="sm"
            icon={permissionIcon}
            showCaret={false}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>
              {t('modelSelector.permissions')}
            </DropdownMenuLabel>
            {config.permissions.map((policy) => {
              const meta = permissionMetaByPolicy[policy];
              return (
                <DropdownMenuItem
                  key={policy}
                  icon={meta?.icon ?? HandIcon}
                  onClick={() => handlePermissionPolicyChange(policy)}
                >
                  {meta?.label ?? toPrettyCase(policy)}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {config.agents.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTriggerButton size="sm" label={agentLabel} />
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t('modelSelector.agent')}</DropdownMenuLabel>
            <DropdownMenuItem
              icon={selectedAgentId === null ? CheckIcon : undefined}
              onClick={() => handleAgentSelect(null)}
            >
              {t('modelSelector.default')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {config.agents.map((agentOption) => (
              <DropdownMenuItem
                key={agentOption.id}
                icon={
                  agentOption.id === selectedAgentId ? CheckIcon : undefined
                }
                onClick={() => handleAgentSelect(agentOption.id)}
              >
                {agentOption.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
