import { useEffect, useRef } from 'react';
import { useCurrentUser } from '@/hooks/auth/useCurrentUser';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import type { SharedTaskRecord } from './useProjectTasks';
import type { SharedTaskDetails, TaskWithAttemptStatus } from 'shared/types';

interface UseAutoLinkSharedTasksProps {
  sharedTasksById: Record<string, SharedTaskRecord>;
  localTasksById: Record<string, TaskWithAttemptStatus>;
  referencedSharedIds: Set<string>;
  isLoading: boolean;
  remoteProjectId?: string;
  projectId?: string;
}

/**
 * Automatically links shared tasks that are assigned to the current user
 * and don't have a corresponding local task yet.
 */
export function useAutoLinkSharedTasks({
  sharedTasksById,
  localTasksById,
  referencedSharedIds,
  isLoading,
  remoteProjectId,
  projectId,
}: UseAutoLinkSharedTasksProps): void {
  const { data: currentUser } = useCurrentUser();
  const { linkSharedTaskToLocal } = useTaskMutations(projectId);
  const linkingInProgress = useRef<Set<string>>(new Set());
  const failedTasks = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser?.user_id || isLoading || !remoteProjectId || !projectId) {
      return;
    }

    const tasksToLink = Object.values(sharedTasksById).filter((task) => {
      const isAssignedToCurrentUser =
        task.assignee_user_id === currentUser.user_id;
      const hasLocalTask = Boolean(localTasksById[task.id]);
      const isAlreadyLinked = referencedSharedIds.has(task.id);
      const isBeingLinked = linkingInProgress.current.has(task.id);
      const hasFailed = failedTasks.current.has(task.id);

      return (
        isAssignedToCurrentUser &&
        !hasLocalTask &&
        !isAlreadyLinked &&
        !isBeingLinked &&
        !hasFailed
      );
    });

    tasksToLink.forEach((task) => {
      linkingInProgress.current.add(task.id);
      linkSharedTaskToLocal.mutate(
        {
          id: task.id,
          project_id: projectId,
          title: task.title,
          description: task.description,
          status: task.status,
        } as SharedTaskDetails,
        {
          onError: () => {
            failedTasks.current.add(task.id);
          },
          onSettled: () => {
            linkingInProgress.current.delete(task.id);
          },
        }
      );
    });
  }, [
    currentUser?.user_id,
    sharedTasksById,
    localTasksById,
    referencedSharedIds,
    isLoading,
    remoteProjectId,
    projectId,
    linkSharedTaskToLocal,
  ]);
}
