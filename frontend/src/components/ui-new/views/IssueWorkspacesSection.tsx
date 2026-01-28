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
}

/**
 * View component for the workspaces section in the issue panel.
 * Displays a collapsible list of workspace cards.
 */
export function IssueWorkspacesSection({
  workspaces,
  isLoading,
  actions = [],
}: IssueWorkspacesSectionProps) {
  return (
    <CollapsibleSectionHeader
      title="Workspaces"
      persistKey={'kanban-issue-workspaces' as PersistKey}
      defaultExpanded={true}
      actions={actions}
    >
      <div className="px-base pb-base flex flex-col gap-base">
        {isLoading ? (
          <p className="text-low py-half">Loading...</p>
        ) : workspaces.length === 0 ? (
          <p className="text-low py-half">No workspaces</p>
        ) : (
          workspaces.map((workspace) => (
            <IssueWorkspaceCard key={workspace.id} workspace={workspace} />
          ))
        )}
      </div>
    </CollapsibleSectionHeader>
  );
}
