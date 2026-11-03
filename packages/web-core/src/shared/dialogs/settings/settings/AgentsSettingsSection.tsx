import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CaretDownIcon,
  DotsThreeIcon,
  PlusIcon,
  SpinnerIcon,
  StarIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@vibe/ui/components/Dropdown';
import { ExecutorConfigForm } from './ExecutorConfigForm';
import { useMachineProfiles } from '@/shared/hooks/useProfiles';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { CreateConfigurationDialog } from '../CreateConfigurationDialog';
import { DeleteConfigurationDialog } from '../DeleteConfigurationDialog';
import type {
  AcpRegistryAgent,
  BaseCodingAgent,
  CodingAgent,
  ExecutorConfigs,
} from 'shared/types';
import { cn } from '@/shared/lib/utils';
import { toPrettyCase } from '@/shared/lib/string';
import {
  SettingsCard,
  SettingsSaveBar,
  TwoColumnPicker,
  TwoColumnPickerBadge,
  TwoColumnPickerColumn,
  TwoColumnPickerEmpty,
  TwoColumnPickerItem,
} from './SettingsComponents';
import { useSettingsDirty } from './SettingsDirtyContext';
import { useSettingsMachineClient } from './SettingsHostContext';
import { useMachineAcpRegistryAgents } from '@/shared/hooks/useAcpRegistryAgents';
import type { MachineClient } from '@/shared/lib/machineClient';
import { AgentIcon } from '@/shared/components/AgentIcon';
import { getExecutorVariantKeys } from '@/shared/lib/executor';

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;

export function AgentsSettingsSection() {
  const { t } = useTranslation(['settings', 'common']);
  const { setDirty: setContextDirty } = useSettingsDirty();
  const machineClient = useSettingsMachineClient();

  // Profiles hook for server state
  const {
    profilesContent: serverProfilesContent,
    isLoading: profilesLoading,
    isSaving: profilesSaving,
    error: profilesError,
    save: saveProfiles,
  } = useMachineProfiles(machineClient);

  const { config, updateAndSaveConfig, reloadSystem } = useUserSystem();

  // Local editor state
  const [profilesSuccess, setProfilesSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form-based editor state
  const [selectedExecutorType, setSelectedExecutorType] =
    useState<BaseCodingAgent | null>(null);
  const [selectedConfiguration, setSelectedConfiguration] = useState<
    string | null
  >(null);
  const [localParsedProfiles, setLocalParsedProfiles] =
    useState<ExecutorConfigs | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Initialize selection with default executor when config loads
  useEffect(() => {
    if (config?.executor_profile && !selectedExecutorType) {
      setSelectedExecutorType(config.executor_profile.executor);
      setSelectedConfiguration(config.executor_profile.variant || 'DEFAULT');
    }
  }, [config?.executor_profile, selectedExecutorType]);

  // Sync server state to local state when not dirty
  useEffect(() => {
    if (!isDirty && serverProfilesContent) {
      try {
        const parsed = JSON.parse(serverProfilesContent);
        setLocalParsedProfiles(parsed);
      } catch (err) {
        console.error('Failed to parse profiles JSON:', err);
        setLocalParsedProfiles(null);
      }
    }
  }, [serverProfilesContent, isDirty]);

  // Sync dirty state to context for unsaved changes confirmation
  useEffect(() => {
    setContextDirty('agents', isDirty);
    return () => setContextDirty('agents', false);
  }, [isDirty, setContextDirty]);

  const markDirty = (nextProfiles: unknown) => {
    setLocalParsedProfiles(nextProfiles as ExecutorConfigs);
    setIsDirty(true);
  };

  const handleCreateConfig = async (executor: string) => {
    try {
      const result = await CreateConfigurationDialog.show({
        executorType: executor as BaseCodingAgent,
        existingConfigs: getExecutorVariantKeys(
          localParsedProfiles?.executors?.[executor as BaseCodingAgent]
        ),
      });

      if (result.action === 'created' && result.configName) {
        createConfiguration(executor, result.configName, result.cloneFrom);
      }
    } catch {
      // User cancelled
    }
  };

  const createConfiguration = (
    executorType: string,
    configName: string,
    baseConfig?: string | null
  ) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;
    const base =
      baseConfig && executorsMap[executorType]?.[baseConfig]?.[executorType]
        ? executorsMap[executorType][baseConfig][executorType]
        : {};

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configName]: {
            [executorType]: base,
          },
        },
      },
    };

    markDirty(updatedProfiles);
    setSelectedExecutorType(executorType as BaseCodingAgent);
    setSelectedConfiguration(configName);
  };

  const handleDeleteConfig = async (executor: string, configName: string) => {
    try {
      const result = await DeleteConfigurationDialog.show({
        configName,
        executorType: executor as BaseCodingAgent,
      });

      if (result === 'deleted') {
        await deleteConfiguration(executor, configName);
      }
    } catch {
      // User cancelled
    }
  };

  const deleteConfiguration = async (
    executorType: string,
    configToDelete: string
  ) => {
    if (!localParsedProfiles) return;

    setSaveError(null);

    try {
      const executorConfigs =
        localParsedProfiles.executors[executorType as BaseCodingAgent];
      if (!executorConfigs?.[configToDelete]) {
        return;
      }

      const currentConfigs = getExecutorVariantKeys(executorConfigs);
      if (currentConfigs.length <= 1) {
        return;
      }

      const remainingConfigs = { ...executorConfigs };
      delete remainingConfigs[configToDelete];

      const updatedProfiles = {
        ...localParsedProfiles,
        executors: {
          ...localParsedProfiles.executors,
          [executorType]: remainingConfigs,
        },
      };

      const executorsMap = updatedProfiles.executors as unknown as ExecutorsMap;
      if (getExecutorVariantKeys(remainingConfigs).length === 0) {
        executorsMap[executorType] = {
          DEFAULT: { [executorType]: {} },
        };
      }

      try {
        await saveProfiles(JSON.stringify(updatedProfiles, null, 2));
        setLocalParsedProfiles(updatedProfiles);
        setIsDirty(false);

        // Select another config if we deleted the selected one
        if (
          selectedExecutorType === executorType &&
          selectedConfiguration === configToDelete
        ) {
          const nextConfigs = getExecutorVariantKeys(
            executorsMap[executorType] || {}
          );
          setSelectedConfiguration(nextConfigs[0] || 'DEFAULT');
        }

        setProfilesSuccess(true);
        setTimeout(() => setProfilesSuccess(false), 3000);
        reloadSystem();
      } catch (error: unknown) {
        console.error('Failed to save deletion to backend:', error);
        setSaveError(t('settings.agents.errors.deleteFailed'));
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
    }
  };

  const handleMakeDefault = async (executor: string, config: string) => {
    try {
      await updateAndSaveConfig({
        executor_profile: {
          executor: executor as BaseCodingAgent,
          variant: config,
        },
      });
      reloadSystem();
    } catch (err) {
      console.error('Error setting default:', err);
    }
  };

  const handleExecutorConfigChange = (
    executorType: string,
    configuration: string,
    formData: unknown
  ) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;

    const agentConfig = { [executorType]: formData } as CodingAgent;

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configuration]: agentConfig,
        },
      },
    };

    markDirty(updatedProfiles);
  };

  const handleExecutorConfigSave = async (formData: unknown) => {
    if (
      !localParsedProfiles ||
      !localParsedProfiles.executors ||
      !selectedExecutorType ||
      !selectedConfiguration
    )
      return;

    setSaveError(null);

    const agentConfig = { [selectedExecutorType]: formData } as CodingAgent;

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [selectedExecutorType]: {
          ...localParsedProfiles.executors[selectedExecutorType],
          [selectedConfiguration]: agentConfig,
        },
      },
    };

    setLocalParsedProfiles(updatedProfiles);

    try {
      await saveProfiles(JSON.stringify(updatedProfiles, null, 2));
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);
      reloadSystem();
    } catch (err: unknown) {
      console.error('Failed to save profiles:', err);
      setSaveError(t('settings.agents.errors.saveConfigFailed'));
    }
  };

  // Save handler for agent configuration
  const handleSave = async () => {
    if (
      isDirty &&
      localParsedProfiles &&
      selectedExecutorType &&
      selectedConfiguration
    ) {
      const executorsMap =
        localParsedProfiles.executors as unknown as ExecutorsMap;
      const formData =
        executorsMap[selectedExecutorType]?.[selectedConfiguration]?.[
          selectedExecutorType
        ];
      if (formData) {
        await handleExecutorConfigSave(formData);
      }
    }
  };

  // Discard handler for agent configuration
  const handleDiscard = () => {
    if (isDirty && serverProfilesContent) {
      setIsDirty(false);
      try {
        const parsed = JSON.parse(serverProfilesContent);
        setLocalParsedProfiles(parsed);
      } catch {
        // Ignore parse errors on discard
      }
    }
  };

  if (profilesLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <SpinnerIcon
          className="size-icon-lg animate-spin text-brand"
          weight="bold"
        />
        <span className="text-normal">{t('settings.agents.loading')}</span>
      </div>
    );
  }

  const executorsMap =
    localParsedProfiles?.executors as unknown as ExecutorsMap;

  return (
    <>
      <AvailableAgentsCard machineClient={machineClient} />

      {/* Status messages */}
      {!!profilesError && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error mb-4">
          {profilesError instanceof Error
            ? profilesError.message
            : String(profilesError)}
        </div>
      )}

      {profilesSuccess && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-4 text-success font-medium mb-4">
          {t('settings.agents.save.success')}
        </div>
      )}

      {saveError && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error mb-4">
          {saveError}
        </div>
      )}

      <SettingsCard
        title={t('settings.agents.title')}
        description={t('settings.agents.description')}
      >
        {localParsedProfiles?.executors ? (
          /* Two-column layout: agents and variants on top, config form below */
          <div className="space-y-4">
            {/* Two-column selector - Finder-like style, stacked on mobile */}
            <TwoColumnPicker>
              {/* Agents column */}
              <TwoColumnPickerColumn
                label={t('settings.agents.editor.agentLabel')}
                isFirst
              >
                {Object.keys(localParsedProfiles.executors).map((executor) => {
                  const isDefault =
                    config?.executor_profile?.executor === executor;
                  return (
                    <TwoColumnPickerItem
                      key={executor}
                      selected={selectedExecutorType === executor}
                      onClick={() => {
                        setSelectedExecutorType(executor as BaseCodingAgent);
                        const configs = getExecutorVariantKeys(
                          localParsedProfiles.executors[
                            executor as BaseCodingAgent
                          ]
                        );
                        if (configs.length > 0) {
                          setSelectedConfiguration(configs[0]);
                        }
                      }}
                      leading={
                        <AgentIcon
                          agent={executor as BaseCodingAgent}
                          className="size-icon-sm shrink-0"
                        />
                      }
                      trailing={
                        isDefault && (
                          <TwoColumnPickerBadge variant="brand">
                            {t('settings.agents.editor.isDefault')}
                          </TwoColumnPickerBadge>
                        )
                      }
                    >
                      {toPrettyCase(executor)}
                    </TwoColumnPickerItem>
                  );
                })}
              </TwoColumnPickerColumn>

              {/* Variants column */}
              <TwoColumnPickerColumn
                label={t('settings.agents.editor.configLabel')}
                headerAction={
                  selectedExecutorType && (
                    <button
                      className="p-half rounded-sm hover:bg-secondary text-low hover:text-normal"
                      onClick={() => handleCreateConfig(selectedExecutorType)}
                      disabled={profilesSaving}
                      title={t('settings.agents.editor.createNew')}
                    >
                      <PlusIcon className="size-icon-2xs" weight="bold" />
                    </button>
                  )
                }
              >
                {selectedExecutorType &&
                localParsedProfiles.executors[selectedExecutorType] ? (
                  getExecutorVariantKeys(
                    localParsedProfiles.executors[selectedExecutorType]
                  ).map((configName) => {
                    const isDefault =
                      config?.executor_profile?.executor ===
                        selectedExecutorType &&
                      config?.executor_profile?.variant === configName;
                    const configCount = getExecutorVariantKeys(
                      localParsedProfiles.executors[selectedExecutorType]
                    ).length;
                    return (
                      <TwoColumnPickerItem
                        key={configName}
                        selected={selectedConfiguration === configName}
                        onClick={() => setSelectedConfiguration(configName)}
                        trailing={
                          <>
                            {isDefault && (
                              <TwoColumnPickerBadge variant="brand">
                                {t('settings.agents.editor.isDefault')}
                              </TwoColumnPickerBadge>
                            )}
                            <ConfigActionsDropdown
                              executorType={selectedExecutorType}
                              configName={configName}
                              isDefault={isDefault}
                              configCount={configCount}
                              onMakeDefault={handleMakeDefault}
                              onDelete={handleDeleteConfig}
                            />
                          </>
                        }
                      >
                        {toPrettyCase(configName)}
                      </TwoColumnPickerItem>
                    );
                  })
                ) : (
                  <TwoColumnPickerEmpty>
                    {t('settings.agents.selectAgent')}
                  </TwoColumnPickerEmpty>
                )}
              </TwoColumnPickerColumn>
            </TwoColumnPicker>

            {/* Config form */}
            {selectedExecutorType && selectedConfiguration && (
              <div className="bg-secondary/50 border border-border rounded-sm p-4">
                <ExecutorConfigForm
                  key={`${selectedExecutorType}-${selectedConfiguration}`}
                  executor={selectedExecutorType}
                  value={
                    (executorsMap?.[selectedExecutorType]?.[
                      selectedConfiguration
                    ]?.[selectedExecutorType] as Record<string, unknown>) || {}
                  }
                  onChange={(formData) =>
                    handleExecutorConfigChange(
                      selectedExecutorType,
                      selectedConfiguration,
                      formData
                    )
                  }
                  disabled={profilesSaving}
                />
              </div>
            )}
          </div>
        ) : null}
      </SettingsCard>

      <SettingsSaveBar
        show={isDirty}
        saving={profilesSaving}
        saveDisabled={!!profilesError}
        unsavedMessage={t('settings.agents.save.unsavedChanges')}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </>
  );
}

function AvailableAgentsCard({
  machineClient,
}: {
  machineClient: MachineClient | null;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const [expanded, setExpanded] = useState(false);
  const {
    data: agents,
    isLoading,
    isError,
    refetch,
  } = useMachineAcpRegistryAgents(machineClient);

  return (
    // Same layout as SettingsCard, but the whole header toggles the list
    <div className="space-y-4 pb-6 border-b border-border last:border-b-0 last:pb-0">
      <button
        className="group flex w-full items-center justify-between gap-base text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span>
          <span className="block text-base font-medium text-high">
            {t('settings.agents.available.title')}
          </span>
          <span className="block text-sm text-low mt-1">
            {t('settings.agents.available.description')}
          </span>
        </span>
        <span className="shrink-0 flex items-center gap-half text-sm text-low group-hover:text-normal">
          {expanded
            ? t('settings.agents.available.hide')
            : agents
              ? t('settings.agents.available.show', { count: agents.length })
              : t('settings.agents.available.expand')}
          <CaretDownIcon
            className={cn(
              'size-icon-2xs transition-transform',
              expanded && 'rotate-180'
            )}
            weight="bold"
          />
        </span>
      </button>
      {expanded &&
        (isLoading ? (
          <div className="flex items-center justify-center gap-2 py-4">
            <SpinnerIcon
              className="size-icon-sm animate-spin text-brand"
              weight="bold"
            />
            <span className="text-sm text-low">
              {t('settings.agents.available.loading')}
            </span>
          </div>
        ) : isError ? (
          <div className="flex items-center justify-between gap-base bg-error/10 border border-error/50 rounded-sm p-base text-sm text-error">
            {t('settings.agents.available.loadFailed')}
            <button
              className="shrink-0 underline hover:no-underline"
              onClick={() => void refetch()}
            >
              {t('common:buttons.retry')}
            </button>
          </div>
        ) : agents && agents.length > 0 ? (
          <AvailableAgentsList agents={agents} />
        ) : (
          <p className="py-4 text-sm text-low text-center">
            {t('settings.agents.available.empty')}
          </p>
        ))}
    </div>
  );
}

function AvailableAgentsList({ agents }: { agents: AcpRegistryAgent[] }) {
  return (
    <div className="relative overflow-hidden border border-border rounded-sm bg-secondary">
      {/* Capped at ~4 rows so the configurations below stay in view; the
          bottom padding lets the last row scroll clear of the fade */}
      <ul className="max-h-64 overflow-y-auto pb-6 divide-y divide-border">
        {agents.map((agent) => (
          <li key={agent.id} className="flex items-start gap-base p-base">
            <RegistryAgentIcon agent={agent} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-half min-h-6">
                <span className="text-base font-medium text-high truncate">
                  {agent.name}
                </span>
                <span className="text-sm text-low font-ibm-plex-mono shrink-0">
                  v{agent.version}
                </span>
              </div>
              <p className="text-sm text-low mt-0.5 line-clamp-2">
                {agent.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {/* Fade hints that the list scrolls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-secondary to-transparent" />
    </div>
  );
}

function RegistryAgentIcon({ agent }: { agent: AcpRegistryAgent }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="size-6 shrink-0 flex items-center justify-center rounded-sm bg-primary border border-border">
      {agent.icon && !failed ? (
        // Registry icons are monochrome, so invert them for dark mode
        <img
          src={agent.icon}
          alt={agent.name}
          className="size-icon-base dark:invert"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-base font-medium text-low">
          {agent.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

// Helper component for config actions dropdown
function ConfigActionsDropdown({
  executorType,
  configName,
  isDefault,
  configCount,
  onMakeDefault,
  onDelete,
}: {
  executorType: BaseCodingAgent;
  configName: string;
  isDefault: boolean;
  configCount: number;
  onMakeDefault: (executor: string, config: string) => void;
  onDelete: (executor: string, config: string) => void;
}) {
  const { t } = useTranslation(['settings']);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'p-half rounded-sm hover:bg-panel text-low hover:text-normal',
            'opacity-0 group-hover:opacity-100 transition-opacity'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <DotsThreeIcon className="size-icon-xs" weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onMakeDefault(executorType, configName);
          }}
          disabled={isDefault}
        >
          <div className="flex items-center gap-half w-full">
            <StarIcon className="size-icon-xs mr-base" />
            {t('settings.agents.editor.makeDefault')}
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onDelete(executorType, configName);
          }}
          disabled={configCount <= 1}
          className="text-error focus:text-error"
        >
          <div className="flex items-center gap-half w-full">
            <TrashIcon className="size-icon-xs mr-base" />
            {t('settings.agents.editor.deleteText')}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Alias for backwards compatibility
export { AgentsSettingsSection as AgentsSettingsSectionContent };
