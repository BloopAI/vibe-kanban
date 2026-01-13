import { useMutation } from '@tanstack/react-query';
import { projectGroupsApi, projectsApi } from '@/lib/api';
import type {
  CreateProjectGroup,
  UpdateProjectGroup,
  ProjectGroup,
  Project,
} from 'shared/types';

interface UseProjectGroupMutationsOptions {
  onCreateSuccess?: (group: ProjectGroup) => void;
  onCreateError?: (err: unknown) => void;
  onUpdateSuccess?: (group: ProjectGroup) => void;
  onUpdateError?: (err: unknown) => void;
  onDeleteSuccess?: () => void;
  onDeleteError?: (err: unknown) => void;
  onAssignProjectSuccess?: (project: Project) => void;
  onAssignProjectError?: (err: unknown) => void;
}

export function useProjectGroupMutations(
  options?: UseProjectGroupMutationsOptions
) {
  const createGroup = useMutation({
    mutationKey: ['createProjectGroup'],
    mutationFn: (data: CreateProjectGroup) => projectGroupsApi.create(data),
    onSuccess: (group: ProjectGroup) => {
      // WebSocket streaming handles the real-time update
      options?.onCreateSuccess?.(group);
    },
    onError: (err) => {
      console.error('Failed to create project group:', err);
      options?.onCreateError?.(err);
    },
  });

  const updateGroup = useMutation({
    mutationKey: ['updateProjectGroup'],
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectGroup }) =>
      projectGroupsApi.update(id, data),
    onSuccess: (group: ProjectGroup) => {
      // WebSocket streaming handles the real-time update
      options?.onUpdateSuccess?.(group);
    },
    onError: (err) => {
      console.error('Failed to update project group:', err);
      options?.onUpdateError?.(err);
    },
  });

  const deleteGroup = useMutation({
    mutationKey: ['deleteProjectGroup'],
    mutationFn: (id: string) => projectGroupsApi.delete(id),
    onSuccess: () => {
      // WebSocket streaming handles the real-time update
      // Projects in this group will have their group_id set to null
      options?.onDeleteSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to delete project group:', err);
      options?.onDeleteError?.(err);
    },
  });

  const assignProjectToGroup = useMutation({
    mutationKey: ['assignProjectToGroup'],
    mutationFn: ({
      projectId,
      groupId,
    }: {
      projectId: string;
      groupId: string | null;
    }) => projectsApi.setGroup(projectId, groupId),
    onSuccess: (project: Project) => {
      // WebSocket streaming handles the real-time update
      options?.onAssignProjectSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to assign project to group:', err);
      options?.onAssignProjectError?.(err);
    },
  });

  return {
    createGroup,
    updateGroup,
    deleteGroup,
    assignProjectToGroup,
  };
}
