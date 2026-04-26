import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import type { CreateAndStartWorkspaceRequest } from 'shared/types';
import { workspaceSummaryKeys } from '@/shared/hooks/workspaceSummaryKeys';
import { dispatchWorkspaceLinkRefresh } from '@/shared/lib/workspaceLinkRefresh';
interface CreateWorkspaceParams {
  data: CreateAndStartWorkspaceRequest;
  linkToIssue?: {
    remoteProjectId: string;
    issueId: string;
  };
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  const refreshIssueWorkspaceState = (projectId?: string | null) => {
    void queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['taskWorkspaces'] });
    void queryClient.invalidateQueries({
      queryKey: ['taskWorkspacesWithSessions'],
    });
    void queryClient.invalidateQueries({ queryKey: ['workspaceSessions'] });
    void queryClient.invalidateQueries({
      queryKey: ['workspaceCreateDefaults'],
    });

    if (!projectId) {
      return;
    }

    // The local issue/workspace shapes can lag the create/link transaction by a
    // tick, so re-fire the refresh signal after the mutation settles.
    dispatchWorkspaceLinkRefresh({ projectId });
    window.setTimeout(() => {
      dispatchWorkspaceLinkRefresh({ projectId });
    }, 250);
    window.setTimeout(() => {
      dispatchWorkspaceLinkRefresh({ projectId });
    }, 1000);
  };

  const createWorkspace = useMutation({
    mutationFn: async ({ data, linkToIssue }: CreateWorkspaceParams) => {
      const { workspace } = await workspacesApi.createAndStart(data);

      if (linkToIssue && workspace && !workspace.task_id) {
        try {
          await workspacesApi.linkToIssue(
            workspace.id,
            linkToIssue.remoteProjectId,
            linkToIssue.issueId
          );
          dispatchWorkspaceLinkRefresh({
            projectId: linkToIssue.remoteProjectId,
          });
        } catch (linkError) {
          console.error('Failed to link workspace to issue:', linkError);
        }
      }

      return { workspace };
    },
    onSuccess: (_data, variables) => {
      refreshIssueWorkspaceState(variables.linkToIssue?.remoteProjectId);
    },
    onError: (err) => {
      console.error('Failed to create workspace:', err);
    },
  });

  return { createWorkspace };
}
