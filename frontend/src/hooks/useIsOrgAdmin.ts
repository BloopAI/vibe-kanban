import { useUserOrganizations } from './useUserOrganizations';
import { useProject } from '@/contexts/ProjectContext';
import { MemberRole } from 'shared/types';

/**
 * Hook to check if the current user can perform admin-level actions on tasks.
 *
 * Returns true if:
 * 1. The user is viewing a local project (local project owners have full control)
 * 2. The user is an admin in any of their organizations (for remote/hive access)
 *
 * This is used to enable admin-level actions on tasks (like deleting tasks
 * owned by other users). The backend enforces proper authorization, so this
 * is primarily for UI enablement.
 */
export function useIsOrgAdmin(): boolean {
  const { data: orgsData } = useUserOrganizations();
  const { project } = useProject();

  // On local nodes viewing local projects, the owner has full control
  // A local project is one that is NOT remote-only (is_remote = false)
  if (project && !project.is_remote) {
    return true;
  }

  // For remote projects or hive access, check actual org membership
  if (!orgsData?.organizations) {
    return false;
  }

  // Check if user is admin in any of their orgs
  return orgsData.organizations.some(
    (org) => org.user_role === MemberRole.ADMIN
  );
}
