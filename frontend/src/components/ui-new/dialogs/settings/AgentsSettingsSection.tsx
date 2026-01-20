import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cloneDeep, isEqual } from 'lodash';
import {
  SpinnerIcon,
  CheckIcon,
  WarningIcon,
  CaretDownIcon,
} from '@phosphor-icons/react';
import { ExecutorConfigForm } from '@/components/ExecutorConfigForm';
import { useProfiles } from '@/hooks/useProfiles';
import { useUserSystem } from '@/components/ConfigProvider';
import { CreateConfigurationDialog } from '@/components/dialogs/settings/CreateConfigurationDialog';
import { DeleteConfigurationDialog } from '@/components/dialogs/settings/DeleteConfigurationDialog';
import {
  useAgentAvailability,
  type AgentAvailabilityState,
} from '@/hooks/useAgentAvailability';
import type {
  BaseCodingAgent,
  ExecutorConfigs,
  ExecutorProfileId,
} from 'shared/types';
import { cn } from '@/lib/utils';
import { PrimaryButton } from '../../primitives/PrimaryButton';
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

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;

function AgentAvailabilityIndicator({
  availability,
}: {
  availability: AgentAvailabilityState;
}) {
  if (availability === null) {
    return null;
  }

  if (availability.status === 'checking') {
    return (
      <div className="flex items-center gap-2 text-sm text-low">
        <SpinnerIcon className="size-icon-xs animate-spin" />
        <span>Checking availability...</span>
      </div>
    );
  }

  const isAvailable =
    availability.status === 'login_detected' ||
    availability.status === 'installation_found';

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        isAvailable ? 'text-success' : 'text-warning'
      )}
    >
      {isAvailable ? (
        <>
          <CheckIcon className="size-icon-xs" weight="bold" />
          <span>Agent available</span>
        </>
      ) : (
        <>
          <WarningIcon className="size-icon-xs" weight="bold" />
          <span>Agent not found</span>
        </>
      )}
    </div>
  );
}

export function AgentsSettingsSection() {
  const { t } = useTranslation(['settings', 'common']);

  // Profiles hook for server state
  const {
    profilesContent: serverProfilesContent,
    profilesPath,
    isLoading: profilesLoading,
    isSaving: profilesSaving,
    error: profilesError,
    save: saveProfiles,
  } = useProfiles();

  const { config, updateAndSaveConfig, profiles, reloadSystem } =
    useUserSystem();

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

  // Default executor profile state
  const [executorDraft, setExecutorDraft] = useState<ExecutorProfileId | null>(
    () => (config?.executor_profile ? cloneDeep(config.executor_profile) : null)
  );
  const [executorSaving, setExecutorSaving] = useState(false);
  const [executorSuccess, setExecutorSuccess] = useState(false);
  const [executorError, setExecutorError] = useState<string | null>(null);

  // Check agent availability
  const agentAvailability = useAgentAvailability(executorDraft?.executor);

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

  // Check if executor draft differs from saved config
  const executorDirty =
    executorDraft && config?.executor_profile
      ? !isEqual(executorDraft, config.executor_profile)
      : false;

  // Sync executor draft when config changes
  useEffect(() => {
    if (config?.executor_profile) {
      setExecutorDraft((currentDraft) => {
        if (!currentDraft || isEqual(currentDraft, config.executor_profile)) {
          return cloneDeep(config.executor_profile);
        }
        return currentDraft;
      });
    }
  }, [config?.executor_profile]);

  const updateExecutorDraft = (newProfile: ExecutorProfileId) => {
    setExecutorDraft(newProfile);
  };

  const handleSaveExecutorProfile = async () => {
    if (!executorDraft || !config) return;

    setExecutorSaving(true);
    setExecutorError(null);

    try {
      await updateAndSaveConfig({ executor_profile: executorDraft });
      setExecutorSuccess(true);
      setTimeout(() => setExecutorSuccess(false), 3000);
      reloadSystem();
    } catch (err) {
      setExecutorError(t('settings.general.save.error'));
      console.error('Error saving executor profile:', err);
    } finally {
      setExecutorSaving(false);
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

  const executorOptions = profiles
    ? Object.keys(profiles)
        .sort()
        .map((key) => ({ value: key, label: key }))
    : [];

  const configurationOptions = localParsedProfiles?.executors?.[
    selectedExecutorType
  ]
    ? Object.keys(localParsedProfiles.executors[selectedExecutorType]).map(
        (key) => ({ value: key, label: key })
      )
    : [];

  const selectedProfile = profiles?.[executorDraft?.executor || ''];
  const hasVariants =
    selectedProfile && Object.keys(selectedProfile).length > 0;

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

      {executorError && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {executorError}
        </div>
      )}

      {executorSuccess && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-4 text-success font-medium">
          {t('settings.general.save.success')}
        </div>
      )}

      {/* Default Executor Profile */}
      <SettingsCard
        title={t('settings.general.taskExecution.title')}
        description={t('settings.general.taskExecution.description')}
      >
        <SettingsField
          label={t('settings.general.taskExecution.executor.label')}
          description={t('settings.general.taskExecution.executor.helper')}
        >
          <div className="grid grid-cols-2 gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <DropdownMenuTriggerButton
                  label={executorDraft?.executor || 'Select agent'}
                  className="w-full justify-between"
                  disabled={!profiles}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                {executorOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => {
                      const variants = profiles?.[option.value];
                      const keepCurrentVariant =
                        variants &&
                        executorDraft?.variant &&
                        variants[executorDraft.variant];

                      const newProfile: ExecutorProfileId = {
                        executor: option.value as BaseCodingAgent,
                        variant: keepCurrentVariant
                          ? executorDraft!.variant
                          : null,
                      };
                      updateExecutorDraft(newProfile);
                    }}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {hasVariants ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'flex items-center justify-between w-full px-base py-half rounded-sm border border-border bg-secondary',
                      'text-base text-normal hover:bg-secondary/80 focus:outline-none focus:ring-1 focus:ring-brand'
                    )}
                  >
                    <span className="truncate">
                      {executorDraft?.variant ||
                        t('settings.general.taskExecution.defaultLabel')}
                    </span>
                    <CaretDownIcon className="size-icon-xs ml-2 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  {Object.keys(selectedProfile).map((variantLabel) => (
                    <DropdownMenuItem
                      key={variantLabel}
                      onClick={() => {
                        const newProfile: ExecutorProfileId = {
                          executor: executorDraft!.executor,
                          variant: variantLabel,
                        };
                        updateExecutorDraft(newProfile);
                      }}
                    >
                      {variantLabel}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : selectedProfile ? (
              <button
                disabled
                className={cn(
                  'flex items-center justify-between w-full px-base py-half rounded-sm border border-border bg-secondary',
                  'text-base text-low opacity-50 cursor-not-allowed'
                )}
              >
                <span className="truncate">
                  {t('settings.general.taskExecution.defaultLabel')}
                </span>
              </button>
            ) : null}
          </div>
          <AgentAvailabilityIndicator availability={agentAvailability} />
        </SettingsField>

        <div className="flex justify-end">
          <PrimaryButton
            value={t('common:buttons.save')}
            onClick={handleSaveExecutorProfile}
            disabled={!executorDirty || executorSaving}
            actionIcon={executorSaving ? 'spinner' : undefined}
          />
        </div>
      </SettingsCard>

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
                      label={selectedExecutorType}
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
                        {type}
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
                        label={selectedConfiguration}
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
                    onSave={handleExecutorConfigSave}
                    disabled={profilesSaving}
                    isSaving={profilesSaving}
                    isDirty={isDirty}
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

            <SettingsSaveBar
              show={isDirty}
              saving={profilesSaving}
              saveDisabled={!!profilesError}
              onSave={handleJsonEditorSave}
              onDiscard={handleJsonEditorDiscard}
            />
          </div>
        )}
      </SettingsCard>
    </>
  );
}

// Alias for backwards compatibility
export { AgentsSettingsSection as AgentsSettingsSectionContent };
