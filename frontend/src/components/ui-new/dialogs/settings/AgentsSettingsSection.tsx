import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SpinnerIcon,
  StarIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { ExecutorConfigForm } from './ExecutorConfigForm';
import { useProfiles } from '@/hooks/useProfiles';
import { useUserSystem } from '@/components/ConfigProvider';
import { CreateConfigurationDialog } from '@/components/dialogs/settings/CreateConfigurationDialog';
import { DeleteConfigurationDialog } from '@/components/dialogs/settings/DeleteConfigurationDialog';
import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';
import { cn } from '@/lib/utils';
import { toPrettyCase } from '@/utils/string';
import { SettingsCheckbox, SettingsSaveBar } from './SettingsComponents';
import { useSettingsDirty } from './SettingsDirtyContext';
import { IconButton } from '../../primitives/IconButton';

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;

export function AgentsSettingsSection() {
  const { t } = useTranslation(['settings', 'common']);
  const { setDirty: setContextDirty } = useSettingsDirty();

  // Profiles hook for server state
  const {
    profilesContent: serverProfilesContent,
    profilesPath,
    isLoading: profilesLoading,
    isSaving: profilesSaving,
    error: profilesError,
    save: saveProfiles,
  } = useProfiles();

  const { config, updateAndSaveConfig, reloadSystem } = useUserSystem();

  // Local editor state
  const [localProfilesContent, setLocalProfilesContent] = useState('');
  const [profilesSuccess, setProfilesSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form-based editor state
  const [useFormEditor, setUseFormEditor] = useState(true);
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
      setLocalProfilesContent(serverProfilesContent);
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
    setLocalProfilesContent(JSON.stringify(nextProfiles, null, 2));
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
        setLocalProfilesContent(JSON.stringify(updatedProfiles, null, 2));
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
      const contentToSave = JSON.stringify(updatedProfiles, null, 2);
      await saveProfiles(contentToSave);
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);
      setLocalProfilesContent(contentToSave);
      reloadSystem();
    } catch (err: unknown) {
      console.error('Failed to save profiles:', err);
      setSaveError(t('settings.agents.errors.saveConfigFailed'));
    }
  };

  const handleJsonEditorSave = async () => {
    setSaveError(null);
    try {
      await saveProfiles(localProfilesContent);
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);
      reloadSystem();
    } catch (err: unknown) {
      console.error('Failed to save profiles:', err);
      setSaveError(t('settings.agents.errors.saveFailed'));
    }
  };

  const handleJsonEditorDiscard = () => {
    if (serverProfilesContent) {
      setLocalProfilesContent(serverProfilesContent);
      setIsDirty(false);
      try {
        const parsed = JSON.parse(serverProfilesContent);
        setLocalParsedProfiles(parsed);
      } catch {
        // Ignore parse errors on discard
      }
    }
  };

  // Save handler for agent configuration
  const handleSave = async () => {
    if (isDirty) {
      if (
        useFormEditor &&
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
      } else {
        await handleJsonEditorSave();
      }
    }
  };

  // Discard handler for agent configuration
  const handleDiscard = () => {
    if (isDirty) {
      handleJsonEditorDiscard();
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

      {/* JSON Editor toggle */}
      <div className="mb-4">
        <SettingsCheckbox
          id="use-json-editor"
          label={t('settings.agents.editor.formLabel')}
          checked={!useFormEditor}
          onChange={(checked) => setUseFormEditor(!checked)}
          disabled={profilesLoading || !localParsedProfiles}
        />
      </div>

      {useFormEditor && localParsedProfiles?.executors ? (
        /* Two-column layout: agents and variants on top, config form below */
        <div className="space-y-4">
          {/* Two-column selector */}
          <div className="flex gap-4">
            {/* Agents column */}
            <div className="flex-1 bg-secondary/50 border border-border rounded-sm overflow-hidden">
              <div className="px-3 py-2 border-b border-border bg-secondary/50">
                <span className="text-sm font-medium text-high">
                  {t('settings.agents.editor.agentLabel')}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {Object.keys(localParsedProfiles.executors).map((executor) => {
                  const isSelected = selectedExecutorType === executor;
                  const isDefault =
                    config?.executor_profile?.executor === executor;
                  return (
                    <div
                      key={executor}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                        'hover:bg-panel',
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
                      <span className="w-4 flex items-center justify-center shrink-0">
                        {isDefault && (
                          <StarIcon
                            className="size-icon-xs text-warning"
                            weight="fill"
                          />
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-sm truncate flex-1',
                          isSelected ? 'text-brand font-medium' : 'text-normal'
                        )}
                      >
                        {toPrettyCase(executor)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Variants column */}
            <div className="flex-1 bg-secondary/50 border border-border rounded-sm overflow-hidden">
              <div className="px-3 py-2 border-b border-border bg-secondary/50 flex items-center justify-between">
                <span className="text-sm font-medium text-high">
                  {t('settings.agents.editor.configLabel')}
                </span>
                {selectedExecutorType && (
                  <IconButton
                    icon={PlusIcon}
                    aria-label={t('settings.agents.editor.createNew')}
                    onClick={() => handleCreateConfig(selectedExecutorType)}
                    disabled={profilesSaving}
                  />
                )}
              </div>
              <div className="max-h-48 overflow-y-auto">
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
                          'group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                          'hover:bg-panel',
                          isSelected && 'bg-brand/10 text-brand'
                        )}
                        onClick={() => setSelectedConfiguration(configName)}
                      >
                        <span className="w-4 flex items-center justify-center shrink-0">
                          {isDefault && (
                            <StarIcon
                              className="size-icon-xs text-warning"
                              weight="fill"
                            />
                          )}
                        </span>
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
                        {/* Action buttons on hover */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isDefault && (
                            <button
                              className="p-0.5 rounded-sm hover:bg-secondary text-low hover:text-normal"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMakeDefault(
                                  selectedExecutorType,
                                  configName
                                );
                              }}
                              title={t('settings.agents.editor.makeDefault')}
                            >
                              <StarIcon
                                className="size-icon-xs"
                                weight="regular"
                              />
                            </button>
                          )}
                          {configCount > 1 && (
                            <button
                              className="p-0.5 rounded-sm hover:bg-secondary text-low hover:text-error"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteConfig(
                                  selectedExecutorType,
                                  configName
                                );
                              }}
                              title={t('settings.agents.editor.deleteText')}
                            >
                              <TrashIcon
                                className="size-icon-xs"
                                weight="regular"
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-sm text-low text-center">
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
      ) : (
        /* JSON editor */
        <div className="space-y-4">
          <textarea
            value={
              profilesLoading
                ? t('settings.agents.editor.jsonLoading')
                : localProfilesContent
            }
            onChange={(e) => {
              setLocalProfilesContent(e.target.value);
              setIsDirty(true);
              if (e.target.value.trim()) {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setLocalParsedProfiles(parsed);
                } catch {
                  setLocalParsedProfiles(null);
                }
              }
            }}
            disabled={profilesLoading}
            placeholder={t('settings.agents.editor.jsonPlaceholder')}
            className={cn(
              'w-full min-h-[400px] bg-secondary border border-border rounded-sm px-base py-half text-base text-high font-mono',
              'placeholder:text-low focus:outline-none focus:ring-1 focus:ring-brand',
              'resize-y'
            )}
          />

          {!profilesError && profilesPath && (
            <p className="text-sm text-low">
              <span className="font-medium">
                {t('settings.agents.editor.pathLabel')}
              </span>{' '}
              <span className="font-mono text-xs">{profilesPath}</span>
            </p>
          )}
        </div>
      )}

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
