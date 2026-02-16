import { useContext, useMemo, useCallback, type ReactNode } from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import { useQuery } from '@tanstack/react-query';
import {
  useShape,
  type InsertResult,
  type MutationResult,
} from '@/lib/electric/hooks';
import {
  PROJECTS_SHAPE,
  NOTIFICATIONS_SHAPE,
  PROJECT_MUTATION,
  NOTIFICATION_MUTATION,
  type Project,
  type Notification,
  type CreateProjectRequest,
  type UpdateProjectRequest,
  type UpdateNotificationRequest,
} from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import type { SyncError } from '@/lib/electric/types';
import { organizationsApi } from '@/lib/api';
import { organizationKeys } from '@/hooks/organizationKeys';

/**
 * OrgContext provides organization-scoped data and mutations.
 *
 * Entities synced at organization scope:
 * - Projects (data + mutations via Electric)
 * - Notifications (data + mutations via Electric)
 * - Members (data via API, as OrganizationMemberWithProfile)
 */
export interface OrgContextValue {
  organizationId: string;

  // Data
  projects: Project[];
  notifications: Notification[];

  // Loading/error state
  isLoading: boolean;
  error: SyncError | null;
  retry: () => void;

  // Project mutations
  insertProject: (data: CreateProjectRequest) => InsertResult<Project>;
  updateProject: (
    id: string,
    changes: Partial<UpdateProjectRequest>
  ) => MutationResult;
  removeProject: (id: string) => MutationResult;

  // Notification mutations
  updateNotification: (
    id: string,
    changes: Partial<UpdateNotificationRequest>
  ) => MutationResult;

  // Lookup helpers
  getProject: (projectId: string) => Project | undefined;
  getUnseenNotifications: () => Notification[];

  // Computed aggregations
  projectsById: Map<string, Project>;
  membersWithProfilesById: Map<string, OrganizationMemberWithProfile>;
}

const OrgContext = createHmrContext<OrgContextValue | null>('OrgContext', null);

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
  const notificationsResult = useShape(
    NOTIFICATIONS_SHAPE,
    { ...params, user_id: '' }, // user_id will be filled by Electric based on auth
    { enabled, mutation: NOTIFICATION_MUTATION }
  );

  // Members data from API
  const membersQuery = useQuery({
    queryKey: organizationKeys.members(organizationId),
    queryFn: () => organizationsApi.getMembers(organizationId),
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Combined loading state
  const isLoading =
    projectsResult.isLoading ||
    notificationsResult.isLoading ||
    membersQuery.isLoading;

  // First error found
  const error = projectsResult.error || notificationsResult.error || null;

  // Combined retry
  const retry = useCallback(() => {
    projectsResult.retry();
    notificationsResult.retry();
    membersQuery.refetch();
  }, [projectsResult, notificationsResult, membersQuery]);

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

  const getUnseenNotifications = useCallback(
    () => notificationsResult.data.filter((n) => !n.seen),
    [notificationsResult.data]
  );

  const value = useMemo<OrgContextValue>(
    () => ({
      organizationId,

      // Data
      projects: projectsResult.data,
      notifications: notificationsResult.data,

      // Loading/error
      isLoading,
      error,
      retry,

      // Project mutations
      insertProject: projectsResult.insert,
      updateProject: projectsResult.update,
      removeProject: projectsResult.remove,

      // Notification mutations
      updateNotification: notificationsResult.update,

      // Lookup helpers
      getProject,
      getUnseenNotifications,

      // Computed aggregations
      projectsById,
      membersWithProfilesById,
    }),
    [
      organizationId,
      projectsResult,
      notificationsResult,
      isLoading,
      error,
      retry,
      getProject,
      getUnseenNotifications,
      projectsById,
      membersWithProfilesById,
    ]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

/**
 * Hook to access organization context.
 * Must be used within an OrgProvider.
 */
export function useOrgContext(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrgContext must be used within an OrgProvider');
  }
  return context;
}
