import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDownIcon, SpinnerIcon } from '@phosphor-icons/react';
import type { AcpRegistryAgent } from 'shared/types';
import {
  useMachineAcpRegistryAgents,
  useMachineAcpRegistryInstall,
  usePendingAcpRegistryInstalls,
} from '@/shared/hooks/useAcpRegistryAgents';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import type { MachineClient } from '@/shared/lib/machineClient';
import { cn } from '@/shared/lib/utils';
import { AvailableAgentsList } from './AvailableAgentsList';

export function AvailableAgentsCard({
  machineClient,
  hasUnsavedChanges,
}: {
  machineClient: MachineClient | null;
  /**
   * The configurations form has unsaved edits. Its Save sends the whole
   * profiles document, which would undo an install or uninstall made since.
   */
  hasUnsavedChanges: boolean;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const [expanded, setExpanded] = useState(false);
  const {
    data: agents,
    isLoading,
    isError,
    refetch,
  } = useMachineAcpRegistryAgents(machineClient);

  const { config, reloadSystem } = useUserSystem();
  const [actionError, setActionError] = useState<string | null>(null);
  const installMutation = useMachineAcpRegistryInstall(machineClient, {
    onError: (error, { id, install }) => {
      const name = agents?.find((agent) => agent.id === id)?.name ?? id;
      setActionError(
        t(
          install
            ? 'settings.agents.available.installFailed'
            : 'settings.agents.available.uninstallFailed',
          { name, message: error.message }
        )
      );
    },
    onSettled: () => void reloadSystem(),
  });
  // The server serialises installs, so only the clicked rows are disabled
  const pendingIds = usePendingAcpRegistryInstalls(machineClient);

  const handleToggleInstall = (agent: AcpRegistryAgent) => {
    if (hasUnsavedChanges || pendingIds.has(agent.id)) return;
    setActionError(null);
    installMutation.mutate({ id: agent.id, install: !agent.installed });
  };

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
          <>
            {actionError && (
              <p className="bg-error/10 border border-error/50 rounded-sm p-base text-sm text-error">
                {actionError}
              </p>
            )}
            {hasUnsavedChanges && (
              <p className="text-sm text-low">
                {t('settings.agents.available.unsavedChangesHint')}
              </p>
            )}
            <AvailableAgentsList
              agents={agents}
              pendingIds={pendingIds}
              defaultExecutor={config?.executor_profile?.executor ?? null}
              locked={hasUnsavedChanges}
              onToggleInstall={handleToggleInstall}
            />
          </>
        ) : (
          <p className="py-4 text-sm text-low text-center">
            {t('settings.agents.available.empty')}
          </p>
        ))}
    </div>
  );
}
