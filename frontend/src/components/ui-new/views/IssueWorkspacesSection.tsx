import { useTranslation } from 'react-i18next';
import { PlusIcon } from '@phosphor-icons/react';
import {
  IssueWorkspaceCard,
  type WorkspaceWithStats,
} from '@/components/ui-new/views/IssueWorkspaceCard';
import {
  CollapsibleSectionHeader,
  type SectionAction,
} from '@/components/ui-new/primitives/CollapsibleSectionHeader';
import type { PersistKey } from '@/stores/useUiPreferencesStore';

export interface IssueWorkspacesSectionProps {
  workspaces: WorkspaceWithStats[];
  isLoading?: boolean;
  actions?: SectionAction[];
  onWorkspaceClick?: (localWorkspaceId: string | null) => void;
  onCreateWorkspace?: () => void;
  onUnlinkWorkspace?: (localWorkspaceId: string) => void;
  onDeleteWorkspace?: (localWorkspaceId: string) => void;
}

/**
 * View component for the workspaces section in the issue panel.
 * Displays a collapsible list of workspace cards.
 */
export function IssueWorkspacesSection({
  workspaces,
  isLoading,
  actions = [],
  onWorkspaceClick,
  onCreateWorkspace,
  onUnlinkWorkspace,
  onDeleteWorkspace,
}: IssueWorkspacesSectionProps) {
  const { t } = useTranslation('common');

  return (
    <CollapsibleSectionHeader
      title={t('workspaces.title')}
      persistKey={'kanban-issue-workspaces' as PersistKey}
      defaultExpanded={true}
      actions={actions}
    >
      <div className="px-base p-base flex flex-col gap-base border-t">
        {isLoading ? (
          <p className="text-low py-half">{t('workspaces.loading')}</p>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col gap-half p-base bg-panel rounded-sm border border-dashed border-border">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 rounded-sm bg-secondary animate-pulse" />
              <div className="h-5 w-5 rounded-full bg-secondary animate-pulse" />
            </div>
            <div className="flex items-center gap-half">
              <div className="h-3 w-20 rounded-sm bg-secondary animate-pulse" />
              <span className="text-low/50">·</span>
              <div className="h-3 w-12 rounded-sm bg-secondary animate-pulse" />
            </div>
            <p className="text-xs text-low py-half">
              {t('workspaces.noWorkspaces')}
            </p>
            <button
              type="button"
              onClick={onCreateWorkspace}
              disabled={!onCreateWorkspace}
              className="self-start flex items-center gap-half rounded-sm px-base py-half bg-brand text-on-brand hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusIcon className="size-icon-xs" weight="bold" />
              <span>
                {t('kanban.createNewWorkspace', 'Create new workspace')}
              </span>
            </button>
          </div>
        ) : (
          workspaces.map((workspace) => {
            const { localWorkspaceId } = workspace;
            return (
              <IssueWorkspaceCard
                key={workspace.id}
                workspace={workspace}
                onClick={
                  onWorkspaceClick &&
                  localWorkspaceId &&
                  workspace.isOwnedByCurrentUser
                    ? () => onWorkspaceClick(localWorkspaceId)
                    : undefined
                }
                onUnlink={
                  onUnlinkWorkspace && localWorkspaceId
                    ? () => onUnlinkWorkspace(localWorkspaceId)
                    : undefined
                }
                onDelete={
                  onDeleteWorkspace &&
                  localWorkspaceId &&
                  workspace.isOwnedByCurrentUser
                    ? () => onDeleteWorkspace(localWorkspaceId)
                    : undefined
                }
              />
            );
          })
        )}
      </div>
    </CollapsibleSectionHeader>
  );
}
