import { useEffect, useRef, useState } from 'react';
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
import type {
  BaseCodingAgent,
  ExecutorSessionOverrides,
  ModelInfo,
} from 'shared/types';
import { PermissionPolicy } from 'shared/types';
import { toPrettyCase } from '@/utils/string';
import {
  getPinnedModelEntries,
  togglePinnedModelEntry,
  updatePinnedModelEntries,
} from '@/utils/pinnedModels';
import { profilesApi } from '@/lib/api';
import { useUserSystem } from '@/components/ConfigProvider';
import { ModelSelectorPopover } from '../primitives/model-selector/ModelSelectorPopover';
import { useModelSelectorState } from '../hooks/useModelSelectorState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTriggerButton,
} from '../primitives/Dropdown';

interface ModelSelectorContainerProps {
  agent: BaseCodingAgent | null;
  workspaceId: string | undefined;
  onAdvancedSettings: () => void;
  isAttemptRunning: boolean;
  presets: string[];
  selectedPreset: string | null;
  onPresetSelect: (presetId: string | null) => void;
  onSessionOverridesChange: (
    overrides: ExecutorSessionOverrides | null
  ) => void;
}

const permissionMetaByPolicy: Record<
  PermissionPolicy,
  { label: string; icon: Icon }
> = {
  [PermissionPolicy.AUTO]: { label: 'Auto', icon: FastForwardIcon },
  [PermissionPolicy.SUPERVISED]: { label: 'Ask', icon: HandIcon },
  [PermissionPolicy.PLAN]: { label: 'Plan', icon: ListBulletsIcon },
};

function getReasoningLabel(
  options: ModelInfo['reasoning_options'],
  selectedId: string | null
): string | null {
  if (!selectedId) return null;
  return (
    options.find((option) => option.id === selectedId)?.label ??
    toPrettyCase(selectedId)
  );
}

export function ModelSelectorContainer({
  agent,
  workspaceId,
  onAdvancedSettings,
  isAttemptRunning,
  presets,
  selectedPreset,
  onPresetSelect,
  onSessionOverridesChange,
}: ModelSelectorContainerProps) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { profiles, setProfiles, reloadSystem } = useUserSystem();

  const resolvedPreset =
    selectedPreset ??
    (presets.includes('DEFAULT') ? 'DEFAULT' : (presets[0] ?? null));

  const {
    config,
    selectedProviderId,
    selectedModelId,
    selectedAgentId,
    selectedReasoningId,
    permissionPolicy,
    handleProviderSelect,
    handleModelSelect,
    handleAgentSelect,
    handleReasoningSelect,
    handlePermissionPolicyChange,
    permissionChangePending,
    sessionOverrides,
  } = useModelSelectorState({
    agent,
    workspaceId,
    isAttemptRunning,
    preset: resolvedPreset,
  });

  useEffect(() => {
    if (!config) return;
    onSessionOverridesChange(sessionOverrides);
  }, [config, onSessionOverridesChange, sessionOverrides]);

  useEffect(() => {
    setSearchQuery('');
  }, [selectedProviderId]);

  const modelListScrollRef = useRef<HTMLDivElement | null>(null);
  const providerSidebarScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }
    requestAnimationFrame(() => {
      const modelNode = modelListScrollRef.current;
      if (modelNode) modelNode.scrollTop = modelNode.scrollHeight;
      const providerNode = providerSidebarScrollRef.current;
      if (providerNode) providerNode.scrollTop = providerNode.scrollHeight;
    });
  }, [isOpen]);

  const pinnedModelIds = getPinnedModelEntries(profiles, agent);

  const handlePin = (model: ModelInfo) => {
    if (!profiles || !agent) return;
    const currentPinned = getPinnedModelEntries(profiles, agent);
    const nextEntries = togglePinnedModelEntry(currentPinned, model);
    const nextProfiles = updatePinnedModelEntries(profiles, agent, nextEntries);
    setProfiles(nextProfiles);
    void profilesApi
      .save(JSON.stringify({ executors: nextProfiles }, null, 2))
      .catch((error) => {
        console.error('Failed to save pinned models', error);
        void reloadSystem();
      });
  };

  const presetLabel = resolvedPreset ? toPrettyCase(resolvedPreset) : 'Default';

  if (!config) {
    return (
      <div className="flex flex-wrap items-center gap-base">
        <DropdownMenu>
          <DropdownMenuTriggerButton label="Loading..." disabled />
        </DropdownMenu>
      </div>
    );
  }

  const showModelSelector = config.loading || config.models.length > 0;
  const showDefaultOption = !config.default_model && config.models.length > 0;
  const selectedModel = showModelSelector
    ? config.models.find((model) => model.id === selectedModelId)
    : null;
  const reasoningLabel = selectedModel
    ? getReasoningLabel(selectedModel.reasoning_options, selectedReasoningId)
    : null;
  const modelLabelBase = config.loading
    ? 'Loading...'
    : (selectedModel?.name ?? selectedModelId ?? 'Default');
  const modelLabel = reasoningLabel
    ? `${modelLabelBase} · ${reasoningLabel}`
    : modelLabelBase;

  const agentLabel = selectedAgentId
    ? (config.agents.find((entry) => entry.id === selectedAgentId)?.label ??
      toPrettyCase(selectedAgentId))
    : 'Default';

  const permissionMeta = permissionPolicy
    ? (permissionMetaByPolicy[permissionPolicy] ?? null)
    : null;
  const permissionLabelBase = permissionMeta?.label ?? 'Perm';
  const permissionLabel = permissionChangePending
    ? `${permissionLabelBase} (Next Turn)`
    : permissionLabelBase;
  const permissionIcon = permissionMeta?.icon ?? HandIcon;

  return (
    <div className="flex flex-wrap items-center gap-base">
      <DropdownMenu>
        <DropdownMenuTriggerButton
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
          onOpenChange={setIsOpen}
          trigger={
            <DropdownMenuTriggerButton
              label={modelLabel}
              disabled={config.loading}
            />
          }
          config={config}
          selectedProviderId={selectedProviderId}
          selectedModelId={selectedModelId}
          selectedReasoningId={selectedReasoningId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onProviderSelect={handleProviderSelect}
          onModelSelect={handleModelSelect}
          onReasoningSelect={handleReasoningSelect}
          pinnedModelIds={pinnedModelIds}
          onPin={handlePin}
          showDefaultOption={showDefaultOption}
          onSelectDefault={() => handleModelSelect(null)}
          modelListScrollRef={modelListScrollRef}
          providerSidebarScrollRef={providerSidebarScrollRef}
        />
      )}

      {permissionPolicy && config.permissions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTriggerButton
            label={permissionLabel}
            icon={permissionIcon}
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
          <DropdownMenuTriggerButton label={agentLabel} />
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
    </div>
  );
}
