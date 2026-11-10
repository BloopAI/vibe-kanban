import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '@phosphor-icons/react';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import { Tooltip } from '@vibe/ui/components/Tooltip';
import type { AcpRegistryAgent } from 'shared/types';
import { RegistryAgentIcon } from './RegistryAgentIcon';

export function AvailableAgentsList({
  agents,
  pendingIds,
  defaultExecutor,
  locked,
  onToggleInstall,
}: {
  agents: AcpRegistryAgent[];
  pendingIds: Set<string>;
  /** Can't be uninstalled; the server refuses it too */
  defaultExecutor: string | null;
  /** Install and uninstall are unavailable, e.g. while there are unsaved edits */
  locked: boolean;
  onToggleInstall: (agent: AcpRegistryAgent) => void;
}) {
  const { t } = useTranslation(['settings']);
  // Installed first so they're easy to find; sort is stable, so each group
  // keeps the registry's order
  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => Number(b.installed) - Number(a.installed)),
    [agents]
  );

  return (
    <div className="relative overflow-hidden border border-border rounded-sm bg-secondary">
      {/* Capped at ~4 rows so the configurations below stay in view; the
          bottom padding lets the last row scroll clear of the fade */}
      <ul className="max-h-64 overflow-y-auto pb-6 divide-y divide-border">
        {sortedAgents.map((agent) => {
          const isDefault =
            agent.installed && agent.executor === defaultExecutor;
          const disabledReason = locked
            ? t('settings.agents.available.unsavedChangesHint')
            : isDefault
              ? t('settings.agents.available.defaultAgentHint')
              : undefined;
          const button = (
            <PrimaryButton
              variant="tertiary"
              value={
                agent.installed
                  ? t('settings.agents.available.uninstall')
                  : t('settings.agents.available.install')
              }
              actionIcon={pendingIds.has(agent.id) ? 'spinner' : undefined}
              disabled={
                pendingIds.has(agent.id) || disabledReason !== undefined
              }
              onClick={() => onToggleInstall(agent)}
            />
          );
          return (
            <li key={agent.id} className="flex items-start gap-base p-base">
              <div className="size-6 shrink-0 flex items-center justify-center rounded-sm bg-primary border border-border">
                <RegistryAgentIcon
                  agent={agent}
                  className="size-full text-base"
                />
              </div>
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
              <div className="shrink-0 self-center flex items-center gap-base">
                {agent.installed && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <CheckIcon className="size-icon-xs" weight="bold" />
                    {t('settings.agents.available.installed')}
                  </span>
                )}
                {disabledReason ? (
                  // Disabled buttons get no pointer events, so the tooltip
                  // hangs off a wrapper; no delay, so the reason shows at once
                  <Tooltip
                    content={disabledReason}
                    side="top"
                    delayDuration={0}
                  >
                    <span>{button}</span>
                  </Tooltip>
                ) : (
                  button
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {/* Fade hints that the list scrolls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-secondary to-transparent" />
    </div>
  );
}
