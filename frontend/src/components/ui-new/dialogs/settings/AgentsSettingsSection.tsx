import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SpinnerIcon, StarIcon } from '@phosphor-icons/react';
import { ExecutorConfigForm } from './ExecutorConfigForm';
import { useProfiles } from '@/hooks/useProfiles';
import { useUserSystem } from '@/components/ConfigProvider';
import { CreateConfigurationDialog } from '@/components/dialogs/settings/CreateConfigurationDialog';
import { DeleteConfigurationDialog } from '@/components/dialogs/settings/DeleteConfigurationDialog';
import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';
import { cn } from '@/lib/utils';
import { toPrettyCase } from '@/utils/string';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
} from '../../primitives/Dropdown';
import {
  SettingsCard,
  SettingsField,
  SettingsCheckbox,
  SettingsSaveBar,
} from './SettingsComponents';
import { useSettingsDirty } from './SettingsDirtyContext';

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
    useState<BaseCodingAgent>('CLAUDE_CODE' as BaseCodingAgent);
  const [selectedConfiguration, setSelectedConfiguration] =
    useState<string>('DEFAULT');
  const [localParsedProfiles, setLocalParsedProfiles] =
    useState<ExecutorConfigs | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [makeDefaultSaving, setMakeDefaultSaving] = useState(false);

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

  // Check if current selection is the default
  const isCurrentDefault =
    config?.executor_profile?.executor === selectedExecutorType &&
    config?.executor_profile?.variant === selectedConfiguration;

  const handleMakeDefault = async () => {
    setMakeDefaultSaving(true);
    try {
      await updateAndSaveConfig({
        executor_profile: {
          executor: selectedExecutorType,
          variant: selectedConfiguration,
        },
      });
      reloadSystem();
    } catch (err) {
      console.error('Error setting default:', err);
    } finally {
      setMakeDefaultSaving(false);
    }
  };

  const markDirty = (nextProfiles: unknown) => {
    setLocalParsedProfiles(nextProfiles as ExecutorConfigs);
    setLocalProfilesContent(JSON.stringify(nextProfiles, null, 2));
    setIsDirty(true);
  };

  const openCreateDialog = async () => {
    try {
      const result = await CreateConfigurationDialog.show({
        executorType: selectedExecutorType,
        existingConfigs: Object.keys(
          localParsedProfiles?.executors?.[selectedExecutorType] || {}
        ),
      });

      if (result.action === 'created' && result.configName) {
        createConfiguration(
          selectedExecutorType,
          result.configName,
          result.cloneFrom
        );
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
    setSelectedConfiguration(configName);
  };

  const openDeleteDialog = async (configName: string) => {
    try {
      const result = await DeleteConfigurationDialog.show({
        configName,
        executorType: selectedExecutorType,
      });

      if (result === 'deleted') {
        await handleDeleteConfiguration(configName);
      }
    } catch {
      // User cancelled
    }
  };

  const handleDeleteConfiguration = async (configToDelete: string) => {
    if (!localParsedProfiles) return;

    setSaveError(null);

    try {
      if (
        !localParsedProfiles.executors[selectedExecutorType]?.[configToDelete]
      ) {
        return;
      }

      const currentConfigs = Object.keys(
        localParsedProfiles.executors[selectedExecutorType] || {}
      );
      if (currentConfigs.length <= 1) {
        return;
      }

      const remainingConfigs = {
        ...localParsedProfiles.executors[selectedExecutorType],
      };
      delete remainingConfigs[configToDelete];

      const updatedProfiles = {
        ...localParsedProfiles,
        executors: {
          ...localParsedProfiles.executors,
          [selectedExecutorType]: remainingConfigs,
        },
      };

      const executorsMap = updatedProfiles.executors as unknown as ExecutorsMap;
      if (Object.keys(remainingConfigs).length === 0) {
        executorsMap[selectedExecutorType] = {
          DEFAULT: { [selectedExecutorType]: {} },
        };
      }

      try {
        await saveProfiles(JSON.stringify(updatedProfiles, null, 2));
        setLocalParsedProfiles(updatedProfiles);
        setLocalProfilesContent(JSON.stringify(updatedProfiles, null, 2));
        setIsDirty(false);

        const nextConfigs = Object.keys(
          executorsMap[selectedExecutorType] || {}
        );
        const nextSelected = nextConfigs[0] || 'DEFAULT';
        setSelectedConfiguration(nextSelected);

        setProfilesSuccess(true);
        setTimeout(() => setProfilesSuccess(false), 3000);
        reloadSystem();
      } catch (saveError: unknown) {
        console.error('Failed to save deletion to backend:', saveError);
        setSaveError(t('settings.agents.errors.deleteFailed'));
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
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
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

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
      if (useFormEditor && localParsedProfiles) {
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

  const configurationOptions = localParsedProfiles?.executors?.[
    selectedExecutorType
  ]
    ? Object.keys(localParsedProfiles.executors[selectedExecutorType]).map(
        (key) => ({ value: key, label: toPrettyCase(key) })
      )
    : [];

  return (
    <>
      {/* Status messages */}
      {!!profilesError && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {profilesError instanceof Error
            ? profilesError.message
            : String(profilesError)}
        </div>
      )}

      {profilesSuccess && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-4 text-success font-medium">
          {t('settings.agents.save.success')}
        </div>
      )}

      {saveError && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {saveError}
        </div>
      )}

      {/* Agent Configuration */}
      <SettingsCard
        title={t('settings.agents.title')}
        description={t('settings.agents.description')}
      >
        <SettingsCheckbox
          id="use-json-editor"
          label={t('settings.agents.editor.formLabel')}
          checked={!useFormEditor}
          onChange={(checked) => setUseFormEditor(!checked)}
          disabled={profilesLoading || !localParsedProfiles}
        />

        {useFormEditor &&
        localParsedProfiles &&
        localParsedProfiles.executors ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <SettingsField label={t('settings.agents.editor.agentLabel')}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <DropdownMenuTriggerButton
                      label={toPrettyCase(selectedExecutorType)}
                      className="w-full justify-between"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    {Object.keys(localParsedProfiles.executors).map((type) => (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => {
                          setSelectedExecutorType(type as BaseCodingAgent);
                          setSelectedConfiguration('DEFAULT');
                        }}
                      >
                        {toPrettyCase(type)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SettingsField>

              <SettingsField label={t('settings.agents.editor.configLabel')}>
                <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <DropdownMenuTriggerButton
                        label={toPrettyCase(selectedConfiguration)}
                        className="flex-1 justify-between"
                        disabled={
                          !localParsedProfiles.executors[selectedExecutorType]
                        }
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                      {configurationOptions.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() => setSelectedConfiguration(option.value)}
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem onClick={openCreateDialog}>
                        {t('settings.agents.editor.createNew')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    onClick={() => openDeleteDialog(selectedConfiguration)}
                    disabled={
                      profilesSaving ||
                      !localParsedProfiles.executors[selectedExecutorType] ||
                      configurationOptions.length <= 1
                    }
                    className={cn(
                      'px-base py-half rounded-sm text-sm font-medium',
                      'bg-error/10 text-error hover:bg-error/20 border border-error/50',
                      'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                    )}
                  >
                    {t('settings.agents.editor.deleteText')}
                  </button>
                  <button
                    onClick={handleMakeDefault}
                    disabled={makeDefaultSaving || isCurrentDefault}
                    className={cn(
                      'flex items-center gap-1.5 px-base py-half rounded-sm text-sm font-medium',
                      isCurrentDefault
                        ? 'bg-success/10 text-success border border-success/50'
                        : 'bg-brand/10 text-brand hover:bg-brand/20 border border-brand/50',
                      'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                    )}
                  >
                    <StarIcon
                      className="size-icon-xs"
                      weight={isCurrentDefault ? 'fill' : 'regular'}
                    />
                    {isCurrentDefault
                      ? t('settings.agents.editor.isDefault')
                      : t('settings.agents.editor.makeDefault')}
                  </button>
                </div>
              </SettingsField>
            </div>

            {(() => {
              const executorsMap =
                localParsedProfiles.executors as unknown as ExecutorsMap;
              return (
                !!executorsMap[selectedExecutorType]?.[selectedConfiguration]?.[
                  selectedExecutorType
                ] && (
                  <ExecutorConfigForm
                    key={`${selectedExecutorType}-${selectedConfiguration}`}
                    executor={selectedExecutorType}
                    value={
                      (executorsMap[selectedExecutorType][
                        selectedConfiguration
                      ][selectedExecutorType] as Record<string, unknown>) || {}
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
                )
              );
            })()}
          </div>
        ) : (
          <div className="space-y-4">
            <SettingsField label={t('settings.agents.editor.jsonLabel')}>
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
                  'w-full min-h-[300px] bg-secondary border border-border rounded-sm px-base py-half text-base text-high font-mono',
                  'placeholder:text-low focus:outline-none focus:ring-1 focus:ring-brand',
                  'resize-y'
                )}
              />
            </SettingsField>

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

// Alias for backwards compatibility
export { AgentsSettingsSection as AgentsSettingsSectionContent };
