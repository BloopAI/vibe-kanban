import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { tasksApi, attemptsApi } from '@/lib/api';
import { taskKeys } from './useTask';
import { taskRelationshipsKeys } from './useTaskRelationships';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import type { CreateAndStartTaskRequest } from 'shared/types';

interface CreateWorkspaceParams {
  data: CreateAndStartTaskRequest;
  linkToIssue?: {
    remoteProjectId: string;
    issueId: string;
  };
}

interface UseCreateWorkspaceOptions {
  onWorkspaceCreated?: (workspaceId: string) => void;
}

export function useCreateWorkspace(options: UseCreateWorkspaceOptions = {}) {
  const { onWorkspaceCreated } = options;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createWorkspace = useMutation({
    mutationFn: async ({ data, linkToIssue }: CreateWorkspaceParams) => {
      const task = await tasksApi.createAndStart(data);
      const workspaces = await attemptsApi.getAll(task.id);
      const workspaceId = workspaces[0]?.id;

      // Link to issue if requested
      if (linkToIssue && workspaceId) {
        await attemptsApi.linkToIssue(
          workspaceId,
          linkToIssue.remoteProjectId,
          linkToIssue.issueId
        );
      }

      return { task, workspaceId };
    },
    onSuccess: ({ task, workspaceId }) => {
      // Invalidate task queries
      queryClient.invalidateQueries({ queryKey: taskKeys.all });

      // Invalidate workspace summaries so they refresh with the new workspace included
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });

      // Invalidate parent's relationships cache if this is a subtask
      if (task.parent_workspace_id) {
        queryClient.invalidateQueries({
          queryKey: taskRelationshipsKeys.byAttempt(task.parent_workspace_id),
        });
      }

      // Navigate to the new workspace (or let caller handle in project sidebar)
      if (workspaceId) {
        if (onWorkspaceCreated) {
          onWorkspaceCreated(workspaceId);
        } else {
          navigate(`/workspaces/${workspaceId}`);
        }
      }
    },
    onError: (err) => {
      console.error('Failed to create workspace:', err);
    },
  });

  return { createWorkspace };
}
