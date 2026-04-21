import { useQuery } from '@tanstack/react-query';
import { tasksApi, workspacesApi } from '@/shared/lib/api';
import type { Task, Workspace } from 'shared/types';

/**
 * Minimal workspace shape accepted by the breadcrumb hook.
 * Only the fields we actually read — lets callers pass a full Workspace
 * or a lightweight summary (e.g., WorkspaceSummary from MCP list).
 */
export type WorkspaceBreadcrumbSource = {
  id: string;
  task_id: string | null;
};

export type TaskBreadcrumb = {
  task: Task | null;
  parentWorkspace: Workspace | null;
  isLoading: boolean;
};

/**
 * Fetch the task and parent workspace associated with a workspace so the
 * breadcrumb can render `Manager → Task → Attempt`. Each lookup is a
 * separate react-query so cache hits are granular and invalidation works
 * per-entity.
 *
 * - If `workspace.task_id` is null, `task` and `parentWorkspace` stay null.
 * - If the task has no `parent_workspace_id`, only `task` populates.
 */
export function useTaskBreadcrumb(
  workspace: WorkspaceBreadcrumbSource | null | undefined
): TaskBreadcrumb {
  const taskId = workspace?.task_id ?? undefined;
  const taskQuery = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
  });

  const parentId = taskQuery.data?.parent_workspace_id ?? undefined;
  const parentQuery = useQuery({
    queryKey: ['workspace', parentId],
    queryFn: () => workspacesApi.get(parentId!),
    enabled: !!parentId,
  });

  return {
    task: taskQuery.data ?? null,
    parentWorkspace: parentQuery.data ?? null,
    isLoading: taskQuery.isLoading || parentQuery.isLoading,
  };
}
