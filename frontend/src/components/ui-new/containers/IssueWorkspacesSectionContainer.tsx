import { useMemo } from 'react';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useOrgContext } from '@/contexts/remote/OrgContext';
import type { WorkspaceWithStats } from '@/components/ui-new/views/IssueWorkspaceCard';
import { IssueWorkspacesSection } from '@/components/ui-new/views/IssueWorkspacesSection';

interface IssueWorkspacesSectionContainerProps {
  issueId: string;
}

/**
 * Container component for the workspaces section.
 * Fetches workspace data from ProjectContext and transforms it for display.
 */
export function IssueWorkspacesSectionContainer({
  issueId,
}: IssueWorkspacesSectionContainerProps) {
  const {
    getWorkspacesForIssue,
    pullRequests,
    isLoading: projectLoading,
  } = useProjectContext();

  const { membersWithProfilesById, isLoading: orgLoading } = useOrgContext();

  // Get workspaces for the issue, with PR info
  const workspacesWithStats: WorkspaceWithStats[] = useMemo(() => {
    const rawWorkspaces = getWorkspacesForIssue(issueId);

    return rawWorkspaces
      .filter((w) => !w.archived)
      .map((workspace) => {
        // Find linked PR for this workspace
        const linkedPr = pullRequests.find(
          (pr) => pr.workspace_id === workspace.id
        );

        // Get owner
        const owner =
          membersWithProfilesById.get(workspace.owner_user_id) ?? null;

        return {
          id: workspace.id,
          localWorkspaceId: workspace.local_workspace_id,
          filesChanged: workspace.files_changed ?? 0,
          linesAdded: workspace.lines_added ?? 0,
          linesRemoved: workspace.lines_removed ?? 0,
          prNumber: linkedPr?.number,
          prUrl: linkedPr?.url,
          prStatus: linkedPr?.status as 'open' | 'merged' | 'closed' | null,
          owner,
          createdAt: workspace.created_at,
        };
      });
  }, [issueId, getWorkspacesForIssue, pullRequests, membersWithProfilesById]);

  const isLoading = projectLoading || orgLoading;

  return (
    <IssueWorkspacesSection
      workspaces={workspacesWithStats}
      isLoading={isLoading}
    />
  );
}
