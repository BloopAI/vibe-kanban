import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import {
  useEntity,
  type InsertResult,
  type MutationResult,
} from '@/lib/electric/hooks';
import {
  PROJECT_ENTITY,
  NOTIFICATION_ENTITY,
  ORGANIZATION_MEMBER_ENTITY,
  USER_ENTITY,
  type Project,
  type Notification,
  type OrganizationMember,
  type User,
  type CreateProjectRequest,
  type UpdateProjectRequest,
  type UpdateNotificationRequest,
} from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import type { SyncError } from '@/lib/electric/types';

/**
 * OrgContext provides organization-scoped data and mutations.
 *
 * Entities synced at organization scope:
 * - Projects (data + mutations)
 * - Notifications (data + mutations)
 * - OrganizationMembers (data only)
 * - Users (data only)
 */
export interface OrgContextValue {
  organizationId: string;

  // Normalized data arrays
  projects: Project[];
  notifications: Notification[];
  members: OrganizationMember[];
  users: User[];

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
  getMember: (userId: string) => OrganizationMember | undefined;
  getUser: (userId: string) => User | undefined;
  getUnseenNotifications: () => Notification[];

  // Computed aggregations (Maps for O(1) lookup)
  projectsById: Map<string, Project>;
  membersById: Map<string, OrganizationMember>;
  usersById: Map<string, User>;

  // Derived data for UI compatibility
  membersWithProfiles: OrganizationMemberWithProfile[];
}

const OrgContext = createContext<OrgContextValue | null>(null);

interface OrgProviderProps {
  organizationId: string;
  children: ReactNode;
}

export function OrgProvider({ organizationId, children }: OrgProviderProps) {
  const params = useMemo(
    () => ({ organization_id: organizationId }),
    [organizationId]
  );

  // Entity subscriptions
  const projectsResult = useEntity(PROJECT_ENTITY, params);
  const notificationsResult = useEntity(NOTIFICATION_ENTITY, {
    ...params,
    user_id: '', // Will be filled by Electric based on auth
  });
  const membersResult = useEntity(ORGANIZATION_MEMBER_ENTITY, params);
  const usersResult = useEntity(USER_ENTITY, params);

  // Combined loading state
  const isLoading =
    projectsResult.isLoading ||
    notificationsResult.isLoading ||
    membersResult.isLoading ||
    usersResult.isLoading;

  // First error found
  const error =
    projectsResult.error ||
    notificationsResult.error ||
    membersResult.error ||
    usersResult.error ||
    null;

  // Combined retry
  const retry = useCallback(() => {
    projectsResult.retry();
    notificationsResult.retry();
    membersResult.retry();
    usersResult.retry();
  }, [projectsResult, notificationsResult, membersResult, usersResult]);

  // Computed Maps for O(1) lookup
  const projectsById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const project of projectsResult.data) {
      map.set(project.id, project);
    }
    return map;
  }, [projectsResult.data]);

  const membersById = useMemo(() => {
    const map = new Map<string, OrganizationMember>();
    for (const member of membersResult.data) {
      map.set(member.user_id, member);
    }
    return map;
  }, [membersResult.data]);

  const usersById = useMemo(() => {
    const map = new Map<string, User>();
    for (const user of usersResult.data) {
      map.set(user.id, user);
    }
    return map;
  }, [usersResult.data]);

  // Derived: combine members and users for UI components that expect OrganizationMemberWithProfile
  const membersWithProfiles = useMemo<OrganizationMemberWithProfile[]>(() => {
    return membersResult.data.map((member) => {
      const user = usersById.get(member.user_id);
      return {
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        first_name: user?.first_name ?? null,
        last_name: user?.last_name ?? null,
        username: user?.username ?? null,
        email: user?.email ?? null,
        avatar_url: null, // Not available from User entity
      };
    });
  }, [membersResult.data, usersById]);

  // Lookup helpers
  const getProject = useCallback(
    (projectId: string) => projectsById.get(projectId),
    [projectsById]
  );

  const getMember = useCallback(
    (userId: string) => membersById.get(userId),
    [membersById]
  );

  const getUser = useCallback(
    (userId: string) => usersById.get(userId),
    [usersById]
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
      members: membersResult.data,
      users: usersResult.data,

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
      getMember,
      getUser,
      getUnseenNotifications,

      // Computed aggregations
      projectsById,
      membersById,
      usersById,

      // Derived data
      membersWithProfiles,
    }),
    [
      organizationId,
      projectsResult,
      notificationsResult,
      membersResult,
      usersResult,
      isLoading,
      error,
      retry,
      getProject,
      getMember,
      getUser,
      getUnseenNotifications,
      projectsById,
      membersById,
      usersById,
      membersWithProfiles,
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
