import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import type {
  CreateAndStartWorkspaceRequest,
  CreateAndStartWorkspaceResponse,
} from 'shared/types';
import { workspaceSummaryKeys } from '@/shared/hooks/workspaceSummaryKeys';

interface CreateWorkspaceParams {
  data: CreateAndStartWorkspaceRequest;
  linkToIssue?: {
    remoteProjectId: string;
    issueId: string;
  };
}

interface CreateWorkspaceResult {
  workspace: CreateAndStartWorkspaceResponse['workspace'];
  linkErrorMessage?: string;
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  const createWorkspace = useMutation({
    mutationFn: async ({
      data,
      linkToIssue,
    }: CreateWorkspaceParams): Promise<CreateWorkspaceResult> => {
      const { workspace } = await workspacesApi.createAndStart(data);
      let linkErrorMessage: string | undefined;

      if (linkToIssue && workspace) {
        try {
          await workspacesApi.linkToIssue(
            workspace.id,
            linkToIssue.remoteProjectId,
            linkToIssue.issueId
          );
        } catch (linkError) {
          linkErrorMessage =
            linkError instanceof Error
              ? linkError.message
              : 'Unknown error while linking workspace to issue';
          console.error('Failed to link workspace to issue:', {
            workspaceId: workspace.id,
            projectId: linkToIssue.remoteProjectId,
            issueId: linkToIssue.issueId,
            error: linkError,
          });
        }
      }

      return { workspace, linkErrorMessage };
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
