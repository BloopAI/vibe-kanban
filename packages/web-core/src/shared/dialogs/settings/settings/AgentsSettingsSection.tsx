import { useEffect, useMemo, useState } from 'react';
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
} from '@vibe/ui/components/Dropdown';
import { ExecutorConfigForm } from './ExecutorConfigForm';
import { useMachineProfiles } from '@/shared/hooks/useProfiles';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useExecutorSchema } from '@/shared/hooks/useExecutorSchema';
import { CreateConfigurationDialog } from '../CreateConfigurationDialog';
import { DeleteConfigurationDialog } from '../DeleteConfigurationDialog';
import { InstallAgentDialog } from '../InstallAgentDialog';
import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';
import { cn } from '@/shared/lib/utils';
import { toPrettyCase } from '@/shared/lib/string';
import {
  SettingsSaveBar,
  TwoColumnPicker,
  TwoColumnPickerColumn,
  TwoColumnPickerItem,
  TwoColumnPickerBadge,
  TwoColumnPickerEmpty,
} from './SettingsComponents';
import { useSettingsDirty } from './SettingsDirtyContext';
import { useSettingsMachineClient } from './SettingsHostContext';
import { AgentIcon, getAgentName } from '@/shared/components/AgentIcon';
import { getExecutorVariantKeys } from '@/shared/lib/executor';
import { useMachineUninstallAcpServer } from '@/shared/hooks/useAcpServers';

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;

// Native executors use their own name as the inner profile key.
// All other executors are ACP servers and use "ACP_SERVER".
const NATIVE_EXECUTORS: Record<string, string> = {
  CLAUDE_CODE: 'CLAUDE_CODE',
  AMP: 'AMP',
  CODEX: 'CODEX',
  OPENCODE: 'OPENCODE',
  CURSOR_AGENT: 'CURSOR_AGENT',
};

function profileInnerKey(executor: string): string {
  return NATIVE_EXECUTORS[executor] ?? 'ACP_SERVER';
}

export function AgentsSettingsSection({
  initialState,
}: {
  initialState?: {
    executor?: string;
    variant?: string;
    openInstall?: boolean;
  };
}) {
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

  const uninstallMutation = useMachineUninstallAcpServer(machineClient);

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

  // Fetch executor config schema dynamically
  const { data: executorSchema, isLoading: schemaLoading } = useExecutorSchema(
    selectedExecutorType,
    machineClient
  );

  // Agent list from profiles (backend injects installed ACP servers into profiles)
  const agentList = useMemo(
    () => Object.keys(localParsedProfiles?.executors ?? {}).sort(),
    [localParsedProfiles?.executors]
  );

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

  // --- Install agent from registry/custom dialog ---
  const handleInstallAgent = async () => {
    try {
      const result = await InstallAgentDialog.show({ machineClient });
      if (result.action === 'installed' && result.name) {
        const name = result.name;
        // Create a default profile entry if one doesn't exist
        if (
          localParsedProfiles &&
          !localParsedProfiles.executors?.[name as BaseCodingAgent]
        ) {
          const innerKey = profileInnerKey(name);
          const acpConfig: Record<string, unknown> = { name };
          if (result.command) {
            acpConfig.base_command_override = result.command;
          }
          const updatedProfiles = {
            ...localParsedProfiles,
            executors: {
              ...localParsedProfiles.executors,
              [name]: {
                DEFAULT: { [innerKey]: acpConfig },
              },
            },
          };
          try {
            await saveProfiles(JSON.stringify(updatedProfiles, null, 2));
            setLocalParsedProfiles(updatedProfiles as ExecutorConfigs);
            reloadSystem();
          } catch {
            // Profile save failed, but agent is installed
          }
        }
        setSelectedExecutorType(name as BaseCodingAgent);
        setSelectedConfiguration('DEFAULT');
      }
    } catch {
      // User cancelled
    }
  };

  // Auto-open install dialog when requested via initialState
  useEffect(() => {
    if (initialState?.openInstall) {
      handleInstallAgent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Uninstall ACP agent ---
  const handleUninstallAgent = async (name: string) => {
    try {
      await uninstallMutation.mutateAsync(name);

      // Remove profiles for this agent
      if (localParsedProfiles?.executors?.[name as BaseCodingAgent]) {
        const { [name as BaseCodingAgent]: _, ...remainingExecutors } =
          localParsedProfiles.executors;
        const updatedProfiles = {
          ...localParsedProfiles,
          executors: remainingExecutors,
        };
        try {
          await saveProfiles(JSON.stringify(updatedProfiles, null, 2));
          setLocalParsedProfiles(updatedProfiles as ExecutorConfigs);
        } catch {
          // Best effort
        }
      }

      // Reset selection if we uninstalled the selected agent
      if (selectedExecutorType === name) {
        const remaining = agentList.filter((a) => a !== name);
        if (remaining.length > 0) {
          setSelectedExecutorType(remaining[0] as BaseCodingAgent);
          const configs = getExecutorVariantKeys(
            localParsedProfiles?.executors?.[remaining[0] as BaseCodingAgent]
          );
          setSelectedConfiguration(configs[0] || 'DEFAULT');
        } else {
          setSelectedExecutorType(null);
          setSelectedConfiguration(null);
        }
      }

      // Reset default if we uninstalled the default agent
      if (config?.executor_profile?.executor === name) {
        const remaining = agentList.filter((a) => a !== name);
        if (remaining.length > 0) {
          await updateAndSaveConfig({
            executor_profile: {
              executor: remaining[0] as BaseCodingAgent,
              variant: 'DEFAULT',
            },
          });
        }
      }

      reloadSystem();
    } catch (err) {
      console.error('Failed to uninstall agent:', err);
      setSaveError('Failed to uninstall agent.');
    }
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

    const innerKey = profileInnerKey(executorType);
    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;
    const base =
      baseConfig && executorsMap[executorType]?.[baseConfig]?.[innerKey]
        ? executorsMap[executorType][baseConfig][innerKey]
        : {};

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configName]: {
            [innerKey]: base,
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

    const innerKey = profileInnerKey(executorType);
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
          DEFAULT: { [innerKey]: {} },
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

    const innerKey = profileInnerKey(executorType);
    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;
    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configuration]: {
            [innerKey]: formData,
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

    const innerKey = profileInnerKey(selectedExecutorType);
    setSaveError(null);

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [selectedExecutorType]: {
          ...localParsedProfiles.executors[selectedExecutorType],
          [selectedConfiguration]: {
            [innerKey]: formData,
          },
        },
      },
    } as ExecutorConfigs;

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
      const innerKey = profileInnerKey(selectedExecutorType);
      const executorsMap =
        localParsedProfiles.executors as unknown as ExecutorsMap;
      const formData =
        executorsMap[selectedExecutorType]?.[selectedConfiguration]?.[innerKey];
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
          <TwoColumnPicker>
            {/* Agents column */}
            <TwoColumnPickerColumn
              label={t('settings.agents.editor.agentLabel')}
              isFirst
              headerAction={
                <button
                  className="p-half rounded-sm hover:bg-secondary text-low hover:text-normal"
                  onClick={handleInstallAgent}
                  title="Install agent"
                >
                  <PlusIcon className="size-icon-2xs" weight="bold" />
                </button>
              }
            >
              {agentList.map((executor) => {
                const isDefault =
                  config?.executor_profile?.executor === executor;
                const isAcp = !(executor in NATIVE_EXECUTORS);
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
                      } else {
                        setSelectedConfiguration('DEFAULT');
                      }
                    }}
                    leading={
                      <AgentIcon
                        agent={executor as BaseCodingAgent}
                        className="size-icon-sm shrink-0"
                      />
                    }
                    trailing={
                      <>
                        {isDefault && (
                          <TwoColumnPickerBadge variant="brand">
                            {t('settings.agents.editor.isDefault')}
                          </TwoColumnPickerBadge>
                        )}
                        {isAcp && (
                          <AgentActionsDropdown
                            agentName={executor}
                            onUninstall={handleUninstallAgent}
                          />
                        )}
                      </>
                    }
                  >
                    {getAgentName(executor as BaseCodingAgent)}
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
                schema={executorSchema}
                schemaLoading={schemaLoading}
                value={
                  (executorsMap?.[selectedExecutorType]?.[
                    selectedConfiguration
                  ]?.[profileInnerKey(selectedExecutorType)] as Record<
                    string,
                    unknown
                  >) || {}
                }
                onChange={(formData) =>
                  handleExecutorConfigChange(
                    selectedExecutorType,
                    selectedConfiguration,
                    formData
                  )
                }
                disabled={profilesSaving || schemaLoading}
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

// Helper component for agent actions dropdown (uninstall)
function AgentActionsDropdown({
  agentName,
  onUninstall,
}: {
  agentName: string;
  onUninstall: (name: string) => void;
}) {
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
            onUninstall(agentName);
          }}
          className="text-error focus:text-error"
        >
          <div className="flex items-center gap-half w-full">
            <TrashIcon className="size-icon-xs mr-base" />
            Uninstall
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
