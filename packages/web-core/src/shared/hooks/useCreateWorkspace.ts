import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import type { CreateAndStartWorkspaceRequest } from 'shared/types';
import { workspaceSummaryKeys } from '@/shared/hooks/workspaceSummaryKeys';
import { workspaceSessionKeys } from '@/shared/hooks/workspaceSessionKeys';

interface CreateWorkspaceParams {
  data: CreateAndStartWorkspaceRequest;
  linkToIssue?: {
    remoteProjectId: string;
    issueId: string;
  };
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  const createWorkspace = useMutation({
    mutationFn: async ({ data, linkToIssue }: CreateWorkspaceParams) => {
      const { workspace, execution_process } =
        await workspacesApi.createAndStart(data);

      if (linkToIssue && workspace) {
        try {
          await workspacesApi.linkToIssue(
            workspace.id,
            linkToIssue.remoteProjectId,
            linkToIssue.issueId
          );
        } catch (linkError) {
          console.error('Failed to link workspace to issue:', linkError);
        }
      }

      return { workspace, execution_process };
    },
    onSuccess: ({ workspace }) => {
      // Invalidate workspace summaries so they refresh with the new workspace included
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
      // Ensure create-mode defaults refetch the latest session/model selection.
      queryClient.invalidateQueries({ queryKey: ['workspaceCreateDefaults'] });
      // Refetch the freshly-created workspace's sessions so `session.executor`
      // (set server-side during `start_workspace`) lands in the React Query
      // cache before the chat panel mounts. Critical for Cursor MCP
      // adoption: without this the SessionChatBoxContainer can briefly
      // see `session.executor === null` and route messages through the
      // generic `sessionsApi.followUp` queue path instead of
      // `cursorMcpApi.resolve`.
      if (workspace?.id) {
        queryClient.invalidateQueries({
          queryKey: workspaceSessionKeys.byWorkspace(workspace.id),
        });
      }
    },
    onError: (err) => {
      console.error('Failed to create workspace:', err);
    },
  });

  return { createWorkspace };
}
