import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import type { CreateAndStartWorkspaceRequest } from 'shared/types';

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
      const { workspace } = await attemptsApi.createAndStart(data);

      // Link to issue if requested
      if (linkToIssue && workspace) {
        await attemptsApi.linkToIssue(
          workspace.id,
          linkToIssue.remoteProjectId,
          linkToIssue.issueId
        );
      }

      return { workspace };
    },
    onSuccess: () => {
      // Invalidate workspace summaries so they refresh with the new workspace included
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
      // Ensure create-mode defaults refetch the latest session/model selection.
      queryClient.invalidateQueries({ queryKey: ['workspaceCreateDefaults'] });
    },
    onError: (err) => {
      console.error('Failed to create workspace:', err);
    },
  });

  return { createWorkspace };
}
