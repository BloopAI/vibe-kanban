import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SpinnerIcon,
  PlusIcon,
  TrashIcon,
  DotsThreeIcon,
  StarIcon,
} from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../primitives/Dropdown';
import { ExecutorConfigForm } from './ExecutorConfigForm';
import { useProfiles } from '@/hooks/useProfiles';
import { useUserSystem } from '@/components/ConfigProvider';
import { CreateConfigurationDialog } from '@/components/dialogs/settings/CreateConfigurationDialog';
import { DeleteConfigurationDialog } from '@/components/dialogs/settings/DeleteConfigurationDialog';
import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';
import { cn } from '@/lib/utils';
import { toPrettyCase } from '@/utils/string';
import { SettingsSaveBar } from './SettingsComponents';
import { useSettingsDirty } from './SettingsDirtyContext';
import { AgentIcon } from '@/components/agents/AgentIcon';

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;

export function AgentsSettingsSection() {
  const { t } = useTranslation(['settings', 'common']);
  const { setDirty: setContextDirty } = useSettingsDirty();

  // Profiles hook for server state
  const {
    profilesContent: serverProfilesContent,
    isLoading: profilesLoading,
    isSaving: profilesSaving,
    error: profilesError,
    save: saveProfiles,
  } = useProfiles();

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
        existingConfigs: Object.keys(
          localParsedProfiles?.executors?.[executor as BaseCodingAgent] || {}
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

      const currentConfigs = Object.keys(executorConfigs);
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
      if (Object.keys(remainingConfigs).length === 0) {
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
          const nextConfigs = Object.keys(executorsMap[executorType] || {});
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
    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configuration]: {
            [executorType]: formData,
          },
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

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [selectedExecutorType]: {
          ...localParsedProfiles.executors[selectedExecutorType],
          [selectedConfiguration]: {
            [selectedExecutorType]: formData,
          },
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

      {localParsedProfiles?.executors ? (
        /* Two-column layout: agents and variants on top, config form below */
        <div className="space-y-4">
          {/* Two-column selector - Finder-like style, stacked on mobile */}
          <div className="flex flex-col md:flex-row border border-border rounded-sm overflow-hidden">
            {/* Agents column */}
            <div className="flex-1 border-b md:border-b-0 md:border-r border-border">
              <div className="h-9 px-2 border-b border-border bg-secondary/50 flex items-center">
                <span className="text-sm font-medium text-low tracking-wide">
                  {t('settings.agents.editor.agentLabel')}
                </span>
              </div>
              <div className="max-h-32 md:h-32 overflow-y-auto bg-panel">
                {Object.keys(localParsedProfiles.executors).map((executor) => {
                  const isSelected = selectedExecutorType === executor;
                  const isDefault =
                    config?.executor_profile?.executor === executor;
                  return (
                    <div
                      key={executor}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors',
                        'hover:bg-secondary',
                        isSelected && 'bg-brand/10 text-brand'
                      )}
                      onClick={() => {
                        setSelectedExecutorType(executor as BaseCodingAgent);
                        // Select first config for this executor
                        const configs = Object.keys(
                          localParsedProfiles.executors[
                            executor as BaseCodingAgent
                          ] || {}
                        );
                        if (configs.length > 0) {
                          setSelectedConfiguration(configs[0]);
                        }
                      }}
                    >
                      <AgentIcon
                        agent={executor as BaseCodingAgent}
                        className="size-icon-sm shrink-0"
                      />
                      <span
                        className={cn(
                          'text-sm truncate flex-1',
                          isSelected ? 'text-brand font-medium' : 'text-normal'
                        )}
                      >
                        {toPrettyCase(executor)}
                      </span>
                      {isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/15 text-brand font-medium shrink-0 ml-auto">
                          {t('settings.agents.editor.isDefault')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Variants column */}
            <div className="flex-1">
              <div className="h-9 px-2 border-b border-border bg-secondary/50 flex items-center justify-between">
                <span className="text-sm font-medium text-low tracking-wide">
                  {t('settings.agents.editor.configLabel')}
                </span>
                {selectedExecutorType && (
                  <button
                    className="p-0.5 rounded-sm hover:bg-secondary text-low hover:text-normal"
                    onClick={() => handleCreateConfig(selectedExecutorType)}
                    disabled={profilesSaving}
                    title={t('settings.agents.editor.createNew')}
                  >
                    <PlusIcon className="size-icon-2xs" weight="bold" />
                  </button>
                )}
              </div>
              <div className="max-h-32 md:h-32 overflow-y-auto bg-panel">
                {selectedExecutorType &&
                localParsedProfiles.executors[selectedExecutorType] ? (
                  Object.keys(
                    localParsedProfiles.executors[selectedExecutorType]
                  ).map((configName) => {
                    const isSelected = selectedConfiguration === configName;
                    const isDefault =
                      config?.executor_profile?.executor ===
                        selectedExecutorType &&
                      config?.executor_profile?.variant === configName;
                    const configCount = Object.keys(
                      localParsedProfiles.executors[selectedExecutorType] || {}
                    ).length;
                    return (
                      <div
                        key={configName}
                        className={cn(
                          'group flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors',
                          'hover:bg-secondary',
                          isSelected && 'bg-brand/10 text-brand'
                        )}
                        onClick={() => setSelectedConfiguration(configName)}
                      >
                        <span
                          className={cn(
                            'text-sm truncate flex-1',
                            isSelected
                              ? 'text-brand font-medium'
                              : 'text-normal'
                          )}
                        >
                          {toPrettyCase(configName)}
                        </span>
                        {isDefault && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/15 text-brand font-medium shrink-0 ml-auto">
                            {t('settings.agents.editor.isDefault')}
                          </span>
                        )}
                        {/* Actions dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className={cn(
                                'p-0.5 rounded-sm hover:bg-panel text-low hover:text-normal',
                                'opacity-0 group-hover:opacity-100 transition-opacity',
                                !isDefault && 'ml-auto'
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DotsThreeIcon
                                className="size-icon-xs"
                                weight="bold"
                              />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMakeDefault(
                                  selectedExecutorType,
                                  configName
                                );
                              }}
                              disabled={isDefault}
                            >
                              <div className="flex items-center gap-1 w-full">
                                <StarIcon className="size-icon-xs mr-2" />
                                {t('settings.agents.editor.makeDefault')}
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteConfig(
                                  selectedExecutorType,
                                  configName
                                );
                              }}
                              disabled={configCount <= 1}
                              className="text-error focus:text-error"
                            >
                              <div className="flex items-center gap-1 w-full">
                                <TrashIcon className="size-icon-xs mr-2" />
                                {t('settings.agents.editor.deleteText')}
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-2 py-3 text-sm text-low text-center">
                    {t('settings.agents.selectAgent')}
                  </div>
                )}
              </div>
            </div>
          </div>

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

// Alias for backwards compatibility
export { AgentsSettingsSection as AgentsSettingsSectionContent };
