import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { tasksApi, attemptsApi } from '@/lib/api';
import { taskKeys } from './useTask';
import { taskRelationshipsKeys } from './useTaskRelationships';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import type { CreateAndStartTaskRequest } from 'shared/types';

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createWorkspace = useMutation({
    mutationFn: async (data: CreateAndStartTaskRequest) => {
      const task = await tasksApi.createAndStart(data);
      const workspaces = await attemptsApi.getAll(task.id);
      return { task, workspaceId: workspaces[0]?.id };
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

      // Navigate to the new workspace
      if (workspaceId) {
        navigate(`/workspaces/${workspaceId}`);
      }
    },
    onError: (err) => {
      console.error('Failed to create workspace:', err);
    },
  });

  return { createWorkspace };
}
