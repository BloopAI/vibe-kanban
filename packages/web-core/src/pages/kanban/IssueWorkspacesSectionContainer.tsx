import { useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LinkIcon, PlusIcon } from '@phosphor-icons/react';
import { useProjectContext } from '@/shared/hooks/useProjectContext';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useOrgContext } from '@/shared/hooks/useOrgContext';
import { useUserContext } from '@/shared/hooks/useUserContext';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { useProjectWorkspaceCreateDraft } from '@/shared/hooks/useProjectWorkspaceCreateDraft';
import { workspaceRecordKeys } from '@/shared/hooks/useWorkspaceRecord';
import { workspaceSummaryKeys } from '@/shared/hooks/workspaceSummaryKeys';
import { workspacesApi } from '@/shared/lib/api';
import { getWorkspaceDefaults } from '@/shared/lib/workspaceDefaults';
import {
  buildLinkedIssueCreateState,
  buildLocalWorkspaceIdSet,
  buildWorkspaceCreateInitialState,
  buildWorkspaceCreatePrompt,
} from '@/shared/lib/workspaceCreateState';
import { ConfirmDialog } from '@vibe/ui/components/ConfirmDialog';
import { DeleteWorkspaceDialog } from '@vibe/ui/components/DeleteWorkspaceDialog';
import type { WorkspaceWithStats } from '@vibe/ui/components/IssueWorkspaceCard';
import { IssueWorkspacesSection } from '@vibe/ui/components/IssueWorkspacesSection';
import { RenameWorkspaceDialog } from '@vibe/ui/components/RenameWorkspaceDialog';
import type { SectionAction } from '@vibe/ui/components/CollapsibleSectionHeader';

interface IssueWorkspacesSectionContainerProps {
  issueId: string;
}

type LocalWorkspaceSummary = {
  id: string;
  name: string;
  isRunning?: boolean;
  hasPendingApproval?: boolean;
  hasRunningDevServer?: boolean;
  hasUnseenActivity?: boolean;
  latestProcessCompletedAt?: string | null;
  latestProcessStatus?: string | null;
};

function resolveLocalWorkspaceId(
  remoteWorkspace: {
    local_workspace_id: string | null;
    name: string | null;
  },
  localWorkspacesById: Map<string, LocalWorkspaceSummary>,
  localWorkspaces: LocalWorkspaceSummary[]
): string | null {
  if (
    remoteWorkspace.local_workspace_id &&
    localWorkspacesById.has(remoteWorkspace.local_workspace_id)
  ) {
    return remoteWorkspace.local_workspace_id;
  }

  const normalizedName = remoteWorkspace.name?.trim().toLowerCase() ?? '';
  if (!normalizedName) {
    return null;
  }

  const matches = localWorkspaces.filter(
    (workspace) => workspace.name.trim().toLowerCase() === normalizedName
  );

  return matches.length === 1 ? matches[0].id : null;
}

/**
 * Container component for the workspaces section.
 * Fetches workspace data from ProjectContext and transforms it for display.
 */
export function IssueWorkspacesSectionContainer({
  issueId,
}: IssueWorkspacesSectionContainerProps) {
  const { t } = useTranslation('common');
  const { projectId } = useParams({ strict: false });
  const queryClient = useQueryClient();
  const appNavigation = useAppNavigation();
  const { openWorkspaceCreateFromState } = useProjectWorkspaceCreateDraft();
  const { userId } = useAuth();
  const { workspaces } = useUserContext();

  const {
    pullRequests,
    getIssue,
    getWorkspacesForIssue,
    issues,
    isLoading: projectLoading,
  } = useProjectContext();
  const { activeWorkspaces, archivedWorkspaces } = useWorkspaceContext();
  const { membersWithProfilesById, isLoading: orgLoading } = useOrgContext();

  const localWorkspacesById = useMemo(() => {
    const map = new Map<string, (typeof activeWorkspaces)[number]>();

    for (const workspace of activeWorkspaces) {
      map.set(workspace.id, workspace);
    }

    for (const workspace of archivedWorkspaces) {
      map.set(workspace.id, workspace);
    }

    return map;
  }, [activeWorkspaces, archivedWorkspaces]);

  const allLocalWorkspaces = useMemo(
    () => [...activeWorkspaces, ...archivedWorkspaces],
    [activeWorkspaces, archivedWorkspaces]
  );

  // Get workspaces for the issue, with PR info
  const workspacesWithStats: WorkspaceWithStats[] = useMemo(() => {
    const rawWorkspaces = getWorkspacesForIssue(issueId);

    return rawWorkspaces.map((workspace) => {
      const resolvedLocalWorkspaceId = resolveLocalWorkspaceId(
        workspace,
        localWorkspacesById,
        allLocalWorkspaces
      );
      const localWorkspace = resolvedLocalWorkspaceId
        ? localWorkspacesById.get(resolvedLocalWorkspaceId)
        : undefined;

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
        localWorkspaceId: resolvedLocalWorkspaceId,
        name: workspace.name,
        archived: workspace.archived,
        filesChanged: workspace.files_changed ?? 0,
        linesAdded: workspace.lines_added ?? 0,
        linesRemoved: workspace.lines_removed ?? 0,
        prs: linkedPrs,
        owner,
        updatedAt: workspace.updated_at,
        isOwnedByCurrentUser: workspace.owner_user_id === userId,
        isRunning: localWorkspace?.isRunning,
        hasPendingApproval: localWorkspace?.hasPendingApproval,
        hasRunningDevServer: localWorkspace?.hasRunningDevServer,
        hasUnseenActivity: localWorkspace?.hasUnseenActivity,
        latestProcessCompletedAt: localWorkspace?.latestProcessCompletedAt,
        latestProcessStatus: localWorkspace?.latestProcessStatus,
      };
    });
  }, [
    issueId,
    getWorkspacesForIssue,
    pullRequests,
    membersWithProfilesById,
    userId,
    localWorkspacesById,
    allLocalWorkspaces,
  ]);

  const isLoading = projectLoading || orgLoading;
  const shouldAnimateCreateButton = useMemo(() => {
    if (issues.length !== 1) {
      return false;
    }

    return issues.every(
      (issue) => getWorkspacesForIssue(issue.id).length === 0
    );
  }, [issues, getWorkspacesForIssue]);

  // Handle clicking '+' to create and link a new workspace directly
  const handleAddWorkspace = useCallback(async () => {
    if (!projectId) {
      return;
    }

    const issue = getIssue(issueId);
    const initialPrompt = buildWorkspaceCreatePrompt(
      issue?.title ?? null,
      issue?.description ?? null
    );
    const localWorkspaceIds = buildLocalWorkspaceIdSet(
      activeWorkspaces,
      archivedWorkspaces
    );

    const defaults = await getWorkspaceDefaults(
      workspaces,
      localWorkspaceIds,
      projectId
    );
    const createState = buildWorkspaceCreateInitialState({
      prompt: initialPrompt,
      defaults,
      linkedIssue: buildLinkedIssueCreateState(issue, projectId),
    });

    const draftId = await openWorkspaceCreateFromState(createState, {
      issueId,
    });
    if (!draftId) {
      await ConfirmDialog.show({
        title: t('common:error'),
        message: t(
          'workspaces.createDraftError',
          'Failed to prepare workspace draft. Please try again.'
        ),
        confirmText: t('common:ok'),
        showCancelButton: false,
      });
    }
  }, [
    projectId,
    openWorkspaceCreateFromState,
    getIssue,
    issueId,
    activeWorkspaces,
    archivedWorkspaces,
    workspaces,
    t,
  ]);

  // Handle clicking link action to link an existing workspace
  const handleLinkWorkspace = useCallback(async () => {
    if (!projectId) {
      return;
    }

    const { WorkspaceSelectionDialog } = await import(
      '@/shared/dialogs/command-bar/WorkspaceSelectionDialog'
    );
    await WorkspaceSelectionDialog.show({ projectId, issueId });
  }, [projectId, issueId]);

  // Handle clicking a workspace card to open it
  const handleWorkspaceClick = useCallback(
    (localWorkspaceId: string | null) => {
      if (projectId && localWorkspaceId) {
        appNavigation.goToProjectIssueWorkspace(
          projectId,
          issueId,
          localWorkspaceId
        );
      }
    },
    [projectId, issueId, appNavigation]
  );

  const handleRenameWorkspace = useCallback(
    async (localWorkspaceId: string) => {
      const localWorkspace = localWorkspacesById.get(localWorkspaceId);
      if (!localWorkspace) {
        await ConfirmDialog.show({
          title: t('common:error'),
          message: t('workspaces.notFound'),
          confirmText: t('common:ok'),
          showCancelButton: false,
        });
        return;
      }

      await RenameWorkspaceDialog.show({
        currentName: localWorkspace.name || localWorkspace.branch,
        onRename: async (newName) => {
          await workspacesApi.update(localWorkspaceId, { name: newName });
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: workspaceRecordKeys.byId(localWorkspaceId),
            }),
            queryClient.invalidateQueries({
              queryKey: workspaceSummaryKeys.all,
            }),
          ]);
        },
      });
    },
    [localWorkspacesById, queryClient, t]
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
          await workspacesApi.unlinkFromIssue(localWorkspaceId);
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
      const localWorkspace = localWorkspacesById.get(localWorkspaceId);
      if (!localWorkspace) {
        ConfirmDialog.show({
          title: t('common:error'),
          message: t('workspaces.deleteError'),
          confirmText: t('common:ok'),
          showCancelButton: false,
        });
        return;
      }

      const result = await DeleteWorkspaceDialog.show({
        branchName: localWorkspace.branch,
        hasOpenPR:
          workspacesWithStats
            .find(
              (workspace) => workspace.localWorkspaceId === localWorkspaceId
            )
            ?.prs.some((pr) => pr.status === 'open') ?? false,
        isLinkedToIssue: true,
        linkedIssueSimpleId: getIssue(issueId)?.simple_id,
      });

      if (result.action !== 'confirmed') {
        return;
      }

      try {
        // Delete local workspace first
        await workspacesApi.delete(localWorkspaceId, result.deleteBranches);
        // Unlink from remote after successful deletion
        if (result.unlinkFromIssue) {
          await workspacesApi.unlinkFromIssue(localWorkspaceId);
        }
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
    },
    [localWorkspacesById, workspacesWithStats, t, issueId, getIssue]
  );

  // Actions for the section header
  const actions: SectionAction[] = useMemo(
    () => [
      {
        icon: PlusIcon,
        onClick: handleAddWorkspace,
      },
      {
        icon: LinkIcon,
        onClick: handleLinkWorkspace,
      },
    ],
    [handleAddWorkspace, handleLinkWorkspace]
  );

  return (
    <IssueWorkspacesSection
      workspaces={workspacesWithStats}
      isLoading={isLoading}
      actions={actions}
      onWorkspaceClick={handleWorkspaceClick}
      onCreateWorkspace={handleAddWorkspace}
      onRenameWorkspace={handleRenameWorkspace}
      onUnlinkWorkspace={handleUnlinkWorkspace}
      onDeleteWorkspace={handleDeleteWorkspace}
      shouldAnimateCreateButton={shouldAnimateCreateButton}
    />
  );
}
