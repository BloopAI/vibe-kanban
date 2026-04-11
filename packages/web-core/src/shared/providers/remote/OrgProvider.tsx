import { useMemo, useCallback, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShape } from '@/shared/integrations/electric/hooks';
import {
  PROJECTS_SHAPE,
  PROJECT_MUTATION,
  type Project,
} from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { organizationsApi } from '@/shared/lib/api';
import { organizationKeys } from '@/shared/hooks/organizationKeys';
import { OrgContext, type OrgContextValue } from '@/shared/hooks/useOrgContext';

interface OrgProviderProps {
  organizationId: string;
  children: ReactNode;
}

export function OrgProvider({ organizationId, children }: OrgProviderProps) {
  const params = useMemo(
    () => ({ organization_id: organizationId }),
    [organizationId]
  );
  const enabled = Boolean(organizationId);

  // Shape subscriptions (Electric sync)
  const projectsResult = useShape(PROJECTS_SHAPE, params, {
    enabled,
    mutation: PROJECT_MUTATION,
  });

  // Members data from API
  const membersQuery = useQuery({
    queryKey: organizationKeys.members(organizationId),
    queryFn: () => organizationsApi.getMembers(organizationId),
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Combined loading state
  const isLoading = projectsResult.isLoading || membersQuery.isLoading;

  // First error found
  const error = projectsResult.error || null;

  // Combined retry
  const retry = useCallback(() => {
    projectsResult.retry();
    membersQuery.refetch();
  }, [projectsResult, membersQuery]);

  // Computed Maps for O(1) lookup
  const projectsById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const project of projectsResult.data) {
      map.set(project.id, project);
    }
    return map;
  }, [projectsResult.data]);

  const membersWithProfilesById = useMemo(() => {
    const map = new Map<string, OrganizationMemberWithProfile>();
    for (const member of membersQuery.data ?? []) {
      map.set(member.user_id, member);
    }
    return map;
  }, [membersQuery.data]);

  // Lookup helpers
  const getProject = useCallback(
    (projectId: string) => projectsById.get(projectId),
    [projectsById]
  );

  const value = useMemo<OrgContextValue>(
    () => ({
      organizationId,

      // Data
      projects: projectsResult.data,

      // Loading/error
      isLoading,
      error,
      retry,

      // Project mutations
      insertProject: projectsResult.insert,
      updateProject: projectsResult.update,
      removeProject: projectsResult.remove,

      // Lookup helpers
      getProject,

      // Computed aggregations
      projectsById,
      membersWithProfilesById,
    }),
    [
      organizationId,
      projectsResult,
      isLoading,
      error,
      retry,
      getProject,
      projectsById,
      membersWithProfilesById,
    ]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
