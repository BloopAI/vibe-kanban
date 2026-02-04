import { useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '@phosphor-icons/react';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useAuth } from '@/hooks/auth/useAuth';
import { useOrgContext } from '@/contexts/remote/OrgContext';
import { useActions } from '@/contexts/ActionsContext';
import { attemptsApi } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';
import type { WorkspaceWithStats } from '@/components/ui-new/views/IssueWorkspaceCard';
import { IssueWorkspacesSection } from '@/components/ui-new/views/IssueWorkspacesSection';
import type { SectionAction } from '@/components/ui-new/primitives/CollapsibleSectionHeader';

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
  const { t } = useTranslation('common');
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { openWorkspaceSelection } = useActions();
  const { userId } = useAuth();

  const {
    pullRequests,
    getWorkspacesForIssue,
    isLoading: projectLoading,
  } = useProjectContext();
  const { membersWithProfilesById, isLoading: orgLoading } = useOrgContext();

  // Get workspaces for the issue, with PR info
  const workspacesWithStats: WorkspaceWithStats[] = useMemo(() => {
    const rawWorkspaces = getWorkspacesForIssue(issueId);

    return rawWorkspaces.map((workspace) => {
      // Find all linked PRs for this workspace
      const linkedPrs = pullRequests
        .filter((pr) => pr.workspace_id === workspace.id)
        .map((pr) => ({
          number: pr.number,
          url: pr.url,
          status: pr.status as 'open' | 'merged' | 'closed',
        }));

      // Get owner
      const owner =
        membersWithProfilesById.get(workspace.owner_user_id) ?? null;

      return {
        id: workspace.id,
        localWorkspaceId: workspace.local_workspace_id,
        name: workspace.name,
        archived: workspace.archived,
        filesChanged: workspace.files_changed ?? 0,
        linesAdded: workspace.lines_added ?? 0,
        linesRemoved: workspace.lines_removed ?? 0,
        prs: linkedPrs,
        owner,
        updatedAt: workspace.updated_at,
        isOwnedByCurrentUser: workspace.owner_user_id === userId,
      };
    });
  }, [
    issueId,
    getWorkspacesForIssue,
    pullRequests,
    membersWithProfilesById,
    userId,
  ]);

  const isLoading = projectLoading || orgLoading;

  // Handle clicking '+' to link a workspace
  const handleAddWorkspace = useCallback(() => {
    if (projectId) {
      openWorkspaceSelection(projectId, issueId);
    }
  }, [projectId, issueId, openWorkspaceSelection]);

  // Handle clicking a workspace card to open it
  const handleWorkspaceClick = useCallback(
    (localWorkspaceId: string | null) => {
      if (localWorkspaceId) {
        navigate(`/workspaces/${localWorkspaceId}`);
      }
    },
    [navigate]
  );

  // Handle unlinking a workspace from the issue
  const handleUnlinkWorkspace = useCallback(
    async (localWorkspaceId: string) => {
      const result = await ConfirmDialog.show({
        title: t('workspaces.unlinkFromIssue'),
        message: t('workspaces.unlinkConfirmMessage'),
        confirmText: t('workspaces.unlink'),
        variant: 'destructive',
      });

      if (result === 'confirmed') {
        try {
          await attemptsApi.unlinkFromIssue(localWorkspaceId);
        } catch (error) {
          ConfirmDialog.show({
            title: t('common:error'),
            message:
              error instanceof Error
                ? error.message
                : t('workspaces.unlinkError'),
            confirmText: t('common:ok'),
            showCancelButton: false,
          });
        }
      }
    },
    [t]
  );

  // Handle deleting a workspace (unlinks first, then deletes local)
  const handleDeleteWorkspace = useCallback(
    async (localWorkspaceId: string) => {
      const result = await ConfirmDialog.show({
        title: t('workspaces.deleteWorkspace'),
        message: t('workspaces.deleteConfirmMessage'),
        confirmText: t('workspaces.delete'),
        variant: 'destructive',
      });

      if (result === 'confirmed') {
        try {
          // First unlink from remote
          await attemptsApi.unlinkFromIssue(localWorkspaceId);
          // Then delete local workspace
          await attemptsApi.delete(localWorkspaceId);
        } catch (error) {
          ConfirmDialog.show({
            title: t('common:error'),
            message:
              error instanceof Error
                ? error.message
                : t('workspaces.deleteError'),
            confirmText: t('common:ok'),
            showCancelButton: false,
          });
        }
      }
    },
    [t]
  );

  // Actions for the section header
  const actions: SectionAction[] = useMemo(
    () => [
      {
        icon: PlusIcon,
        onClick: handleAddWorkspace,
      },
    ],
    [handleAddWorkspace]
  );

  return (
    <IssueWorkspacesSection
      workspaces={workspacesWithStats}
      isLoading={isLoading}
      actions={actions}
      onWorkspaceClick={handleWorkspaceClick}
      onUnlinkWorkspace={handleUnlinkWorkspace}
      onDeleteWorkspace={handleDeleteWorkspace}
    />
  );
}
