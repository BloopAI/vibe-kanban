import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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
    onSuccess: ({ workspace }) => {
      // Invalidate workspace summaries so they refresh with the new workspace included
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });

      // Navigate to the new workspace (or let caller handle in project sidebar)
      if (workspace) {
        navigate(`/workspaces/${workspace.id}`);
      }
    },
    onError: (err) => {
      console.error('Failed to create workspace:', err);
    },
  });

  return { createWorkspace };
}
