import { useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrgContext, type OrgContextValue } from '@/shared/hooks/useOrgContext';
import type { InsertResult, MutationResult } from '@/shared/lib/electric/types';
import { kanbanProjectsApi } from '@/shared/lib/kanbanApi';
import type {
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
} from 'shared/remote-types';
import type {
  OrganizationMemberWithProfile,
  KanbanProject,
} from 'shared/types';
const uuidv4 = () => crypto.randomUUID();

export const KANBAN_PROJECTS_QUERY_KEY = ['kanban', 'projects'] as const;

/** Adapt local KanbanProject to the cloud Project interface (structurally compatible). */
function adaptProject(kp: KanbanProject): Project {
  return {
    id: kp.id,
    organization_id: 'local',
    name: kp.name,
    color: kp.color,
    sort_order: kp.sort_order,
    created_at: kp.created_at,
    updated_at: kp.updated_at,
  };
}

interface LocalKanbanOrgProviderProps {
  children: ReactNode;
}

/**
 * Local-first implementation of OrgContextValue.
 * Fetches kanban projects from the local REST API.
 */
export function LocalKanbanOrgProvider({
  children,
}: LocalKanbanOrgProviderProps) {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: KANBAN_PROJECTS_QUERY_KEY,
    queryFn: kanbanProjectsApi.list,
    staleTime: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateProjectRequest) =>
      kanbanProjectsApi.create({
        id: null,
        name: data.name,
        color: data.color ?? '#6366f1',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: KANBAN_PROJECTS_QUERY_KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: Partial<UpdateProjectRequest>;
    }) =>
      kanbanProjectsApi.update(id, {
        name: changes.name ?? null,
        color: changes.color ?? null,
        sort_order: changes.sort_order ?? null,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: KANBAN_PROJECTS_QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => kanbanProjectsApi.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: KANBAN_PROJECTS_QUERY_KEY }),
  });

  const rawProjects = projectsQuery.data ?? [];
  const projects = useMemo(() => rawProjects.map(adaptProject), [rawProjects]);
  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const value = useMemo<OrgContextValue>(
    () => ({
      organizationId: 'local',

      projects,
      isLoading: projectsQuery.isLoading,
      error: projectsQuery.error
        ? { message: String(projectsQuery.error) }
        : null,
      retry: () => projectsQuery.refetch(),

      insertProject: (data) => {
        const optimisticId = data.id ?? uuidv4();
        const optimisticProject: Project = {
          id: optimisticId,
          organization_id: 'local',
          name: data.name,
          color: data.color,
          sort_order: projects.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const persisted = createMutation.mutateAsync(data).then(adaptProject);
        return {
          data: optimisticProject,
          persisted,
        } satisfies InsertResult<Project>;
      },

      updateProject: (id, changes) => {
        const promise = updateMutation.mutateAsync({ id, changes });
        return { persisted: promise.then(() => {}) } satisfies MutationResult;
      },

      removeProject: (id) => {
        const promise = deleteMutation.mutateAsync(id);
        return { persisted: promise.then(() => {}) } satisfies MutationResult;
      },

      getProject: (projectId) => projectsById.get(projectId),

      projectsById,
      membersWithProfilesById: new Map<string, OrganizationMemberWithProfile>(),
    }),
    [
      projects,
      projectsById,
      projectsQuery.isLoading,
      projectsQuery.error,
      projectsQuery.refetch,
      createMutation,
      updateMutation,
      deleteMutation,
    ]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
