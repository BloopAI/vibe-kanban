import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type {
  CreateProject,
  UpdateProject,
  Project,
  LinkToExistingRequest,
  CreateRemoteProjectRequest,
} from 'shared/types';

interface UseProjectMutationsOptions {
  onCreateSuccess?: (project: Project) => void;
  onCreateError?: (err: unknown) => void;
  onUpdateSuccess?: (project: Project) => void;
  onUpdateError?: (err: unknown) => void;
  onLinkSuccess?: (project: Project) => void;
  onLinkError?: (err: unknown) => void;
  onUnlinkSuccess?: (project: Project) => void;
  onUnlinkError?: (err: unknown) => void;
}

export function useProjectMutations(options?: UseProjectMutationsOptions) {
  const queryClient = useQueryClient();

  const createProject = useMutation({
    mutationKey: ['createProject'],
    mutationFn: (data: CreateProject) => projectsApi.create(data),
    onSuccess: (project: Project) => {
      queryClient.setQueryData(['project', project.id], project);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      options?.onCreateSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to create project:', err);
      options?.onCreateError?.(err);
    },
  });

  const updateProject = useMutation({
    mutationKey: ['updateProject'],
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: UpdateProject;
    }) => projectsApi.update(projectId, data),
    onSuccess: (project: Project) => {
      // Update single project cache
      queryClient.setQueryData(['project', project.id], project);

      // Update the project in the projects list cache immediately
      queryClient.setQueryData<Project[]>(['projects'], (old) => {
        if (!old) return old;
        return old.map((p) => (p.id === project.id ? project : p));
      });

      options?.onUpdateSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to update project:', err);
      options?.onUpdateError?.(err);
    },
  });

  const linkToExisting = useMutation({
    mutationKey: ['linkToExisting'],
    mutationFn: ({
      localProjectId,
      data,
    }: {
      localProjectId: string;
      data: LinkToExistingRequest;
    }) => projectsApi.linkToExisting(localProjectId, data),
    onSuccess: (project: Project) => {
      queryClient.setQueryData(['project', project.id], project);
      queryClient.setQueryData<Project[]>(['projects'], (old) => {
        if (!old) return old;
        return old.map((p) => (p.id === project.id ? project : p));
      });

      // Invalidate to ensure fresh data from server
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });

      // Invalidate organization projects queries since linking affects remote projects
      queryClient.invalidateQueries({
        queryKey: ['organizations'],
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key.length === 3 &&
            key[0] === 'organizations' &&
            key[2] === 'projects'
          );
        },
      });

      options?.onLinkSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to link project:', err);
      options?.onLinkError?.(err);
    },
  });

  const createAndLink = useMutation({
    mutationKey: ['createAndLink'],
    mutationFn: ({
      localProjectId,
      data,
    }: {
      localProjectId: string;
      data: CreateRemoteProjectRequest;
    }) => projectsApi.createAndLink(localProjectId, data),
    onSuccess: (project: Project) => {
      queryClient.setQueryData(['project', project.id], project);
      queryClient.setQueryData<Project[]>(['projects'], (old) => {
        if (!old) return old;
        return old.map((p) => (p.id === project.id ? project : p));
      });

      // Invalidate to ensure fresh data from server
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });

      // Invalidate organization projects queries since linking affects remote projects
      queryClient.invalidateQueries({
        queryKey: ['organizations'],
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key.length === 3 &&
            key[0] === 'organizations' &&
            key[2] === 'projects'
          );
        },
      });

      options?.onLinkSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to create and link project:', err);
      options?.onLinkError?.(err);
    },
  });

  const unlinkProject = useMutation({
    mutationKey: ['unlinkProject'],
    mutationFn: (projectId: string) => projectsApi.unlink(projectId),
    onSuccess: (project: Project) => {
      queryClient.setQueryData(['project', project.id], project);
      queryClient.setQueryData<Project[]>(['projects'], (old) => {
        if (!old) return old;
        return old.map((p) => (p.id === project.id ? project : p));
      });

      // Invalidate to ensure fresh data from server
      queryClient.invalidateQueries({ queryKey: ['projects'] });

      // Invalidate organization projects queries since unlinking affects remote projects
      queryClient.invalidateQueries({
        queryKey: ['organizations'],
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key.length === 3 &&
            key[0] === 'organizations' &&
            key[2] === 'projects'
          );
        },
      });

      options?.onUnlinkSuccess?.(project);
    },
    onError: (err) => {
      console.error('Failed to unlink project:', err);
      options?.onUnlinkError?.(err);
    },
  });

  return {
    createProject,
    updateProject,
    linkToExisting,
    createAndLink,
    unlinkProject,
  };
}
