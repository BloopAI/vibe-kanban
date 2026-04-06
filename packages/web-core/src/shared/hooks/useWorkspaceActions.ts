import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workspacesApi } from '@/shared/lib/api';
import { workspaceKeys } from '@/shared/hooks/useWorkspaces';
import { workspaceSummaryKeys } from '@/shared/hooks/workspaceSummaryKeys';
import { ConfirmDialog } from '@vibe/ui/components/ConfirmDialog';
import { DeleteWorkspaceDialog } from '@vibe/ui/components/DeleteWorkspaceDialog';
import type { WorkspaceWithStats } from '@vibe/ui/components/IssueWorkspaceCard';

interface LocalWorkspace {
  branch: string;
}

interface UseWorkspaceActionsOptions {
  localWorkspacesById: Map<string, LocalWorkspace>;
  findWorkspace: (localWorkspaceId: string) => WorkspaceWithStats | undefined;
}

export function useWorkspaceActions({
  localWorkspacesById,
  findWorkspace,
}: UseWorkspaceActionsOptions) {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();

  const unlinkWorkspace = useCallback(
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

  const archiveWorkspace = useCallback(
    async (localWorkspaceId: string) => {
      const isCurrentlyArchived =
        findWorkspace(localWorkspaceId)?.archived ?? false;

      try {
        await workspacesApi.update(localWorkspaceId, {
          archived: !isCurrentlyArchived,
        });
        queryClient.invalidateQueries({
          queryKey: workspaceKeys.all,
        });
        queryClient.invalidateQueries({
          queryKey: workspaceSummaryKeys.all,
        });
      } catch (error) {
        ConfirmDialog.show({
          title: t('common:error'),
          message:
            error instanceof Error
              ? error.message
              : t('workspaces.archiveError', 'Failed to update workspace'),
          confirmText: t('common:ok'),
          showCancelButton: false,
        });
      }
    },
    [findWorkspace, queryClient, t]
  );

  const deleteWorkspace = useCallback(
    async (
      localWorkspaceId: string,
      linkedIssueSimpleId?: string | null,
      isLinkedToIssue?: boolean
    ) => {
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
          findWorkspace(localWorkspaceId)?.prs.some(
            (pr) => pr.status === 'open'
          ) ?? false,
        isLinkedToIssue: isLinkedToIssue ?? linkedIssueSimpleId != null,
        linkedIssueSimpleId: linkedIssueSimpleId ?? undefined,
      });

      if (result.action !== 'confirmed') {
        return;
      }

      try {
        await workspacesApi.delete(localWorkspaceId, result.deleteBranches);
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
    [localWorkspacesById, findWorkspace, t]
  );

  return { unlinkWorkspace, archiveWorkspace, deleteWorkspace };
}
