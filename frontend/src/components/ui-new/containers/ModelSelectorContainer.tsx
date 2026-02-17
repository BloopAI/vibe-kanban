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
import { toPrettyCase } from '@/utils/string';
import {
  getModelKey,
  getRecentModelEntries,
  touchRecentModel,
  updateRecentModelEntries,
  setRecentReasoning,
} from '@/utils/recentModels';
import {
  getReasoningLabel,
  getSelectedModel,
  escapeAttributeValue,
  parseModelId,
  appendPresetModel,
  isModelAvailable,
} from '@/utils/modelSelector';
import { profilesApi } from '@/lib/api';
import { useUserSystem } from '@/components/ConfigProvider';
import { useModelSelectorConfig } from '@/hooks/useExecutorDiscovery';
import { ModelSelectorPopover } from '../primitives/model-selector/ModelSelectorPopover';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../primitives/Dropdown';
import {
  Toolbar,
  ToolbarDropdown,
  ToolbarDropdownButton,
} from '../primitives/Toolbar';

interface ModelSelectorContainerProps {
  agent: BaseCodingAgent | null;
  workspaceId: string | undefined;
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
  onAdvancedSettings,
  presets,
  selectedPreset,
  onPresetSelect,
  onOverrideChange,
  executorConfig,
  presetOptions,
}: ModelSelectorContainerProps) {
  const { t } = useTranslation('common');
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

  const resolvedPreset = selectedPreset;

  const {
    config: streamConfig,
    loadingModels,
    error: streamError,
  } = useModelSelectorConfig(agent, { workspaceId });

  useEffect(() => {
    if (streamError) {
      console.error('Failed to fetch model config', streamError);
    }
  }, [streamError]);

  const baseConfig = streamConfig;
  const config = appendPresetModel(baseConfig, presetOptions?.model_id);

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

  const resolvedConfigProviderId = resolveProviderId(configProviderId);
  const selectedProviderId = resolvedConfigProviderId;

  const selectedModelId = useMemo(() => {
    if (!config || !configModelId) return null;
    if (selectedProviderId) {
      return isModelAvailable(config, selectedProviderId, configModelId)
        ? configModelId
        : null;
    }

    const selectedModelLower = configModelId.toLowerCase();
    const hasModelMatch = config.models.some(
      (model) => model.id.toLowerCase() === selectedModelLower
    );
    return hasModelMatch ? configModelId : null;
  }, [config, configModelId, selectedProviderId]);

  const selectedModel = config
    ? getSelectedModel(config.models, selectedProviderId, selectedModelId)
    : null;

  const selectedReasoningId = useMemo(() => {
    const reasoningId = executorConfig?.reasoning_id ?? null;
    if (!reasoningId || !selectedModel) return null;
    return selectedModel.reasoning_options.some(
      (option) => option.id === reasoningId
    )
      ? reasoningId
      : null;
  }, [executorConfig?.reasoning_id, selectedModel]);

  const selectedAgentId =
    executorConfig?.agent_id !== undefined ? executorConfig.agent_id : null;

  const supportsPermissions = (config?.permissions.length ?? 0) > 0;

  const defaultPermissionPolicy = config?.permissions.includes(
    PermissionPolicy.AUTO
  )
    ? PermissionPolicy.AUTO
    : null;
  const permissionPolicy = supportsPermissions
    ? executorConfig?.permission_policy &&
      config?.permissions.includes(executorConfig.permission_policy)
      ? executorConfig.permission_policy
      : defaultPermissionPolicy
    : null;

  // LRU persistence (on popover close)

  const recentModelEntries = getRecentModelEntries(profiles, agent);
  const pendingModelRef = useRef<ModelInfo | null>(null);
  const pendingReasoningRef = useRef<string | null>(null);

  const persistPendingSelections = useCallback(() => {
    if (!profiles || !agent) return;
    if (!pendingModelRef.current && !pendingReasoningRef.current) return;

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
    if (pendingReasoningRef.current && reasoningModel) {
      nextProfiles = setRecentReasoning(
        nextProfiles,
        agent,
        reasoningModel,
        pendingReasoningRef.current
      );
      pendingReasoningRef.current = null;
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
    onOverrideChange({ model_id: modelOverride });

    pendingModelRef.current =
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
    pendingReasoningRef.current = null;
    setIsOpen(false);
  };

  const handleReasoningSelect = (reasoningId: string | null) => {
    onOverrideChange({ reasoning_id: reasoningId });
    pendingReasoningRef.current = reasoningId;
    setIsOpen(false);
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
      <Toolbar className="max-w-full min-w-0 overflow-x-auto">
        <DropdownMenu>
          <ToolbarDropdownButton size="sm" label={loadingLabel} disabled />
        </DropdownMenu>
      </Toolbar>
    );
  }

  const showModelSelector = loadingModels || config.models.length > 0;
  const showDefaultOption = config.models.length > 0;
  const displaySelectedModel = showModelSelector
    ? getSelectedModel(config.models, selectedProviderId, selectedModelId)
    : null;
  const reasoningLabel = displaySelectedModel
    ? getReasoningLabel(
        displaySelectedModel.reasoning_options,
        selectedReasoningId
      )
    : null;
  const modelLabelBase = loadingModels
    ? loadingLabel
    : (displaySelectedModel?.name ?? selectedModelId ?? defaultLabel);
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
    <Toolbar className="max-w-full min-w-0 overflow-x-auto">
      <ToolbarDropdown
        size="sm"
        icon={SlidersHorizontalIcon}
        label={
          resolvedPreset && resolvedPreset.toLowerCase() !== 'default'
            ? presetLabel
            : undefined
        }
        showCaret={false}
        align="start"
      >
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
      </ToolbarDropdown>

      {showModelSelector && (
        <ModelSelectorPopover
          isOpen={isOpen}
          onOpenChange={handleOpenChange}
          trigger={
            <ToolbarDropdownButton
              size="sm"
              label={modelLabel}
              disabled={loadingModels}
            />
          }
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
          onSelectDefault={() => handleModelSelect(null)}
          scrollRef={scrollRef}
          expandedProviderId={expandedProviderId}
          onExpandedProviderIdChange={setExpandedProviderId}
        />
      )}

      {config.permissions.length > 0 && (
        <ToolbarDropdown
          size="sm"
          icon={permissionIcon}
          showCaret={false}
          align="start"
        >
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
        </ToolbarDropdown>
      )}

      {config.agents.length > 0 && (
        <ToolbarDropdown size="sm" label={agentLabel} align="start">
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
              icon={agentOption.id === selectedAgentId ? CheckIcon : undefined}
              onClick={() => handleAgentSelect(agentOption.id)}
            >
              {agentOption.label}
            </DropdownMenuItem>
          ))}
        </ToolbarDropdown>
      )}
    </Toolbar>
  );
}
