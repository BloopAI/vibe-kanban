import { useShape } from '@/shared/integrations/electric/hooks';
import { PROJECTS_SHAPE } from 'shared/remote-types';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useUserSystem } from '@/shared/hooks/useUserSystem';

export function useOrganizationProjects(organizationId: string | null) {
  const { isSignedIn } = useAuth();
  const { loginStatus } = useUserSystem();
  const isLocalOnlySession =
    loginStatus?.status === 'loggedin' && !loginStatus.profile;

  // Only subscribe to Electric when signed in AND have an org
  const enabled = isSignedIn && !isLocalOnlySession && !!organizationId;

  const { data, isLoading, error } = useShape(
    PROJECTS_SHAPE,
    { organization_id: organizationId || '' },
    { enabled }
  );

  return {
    data,
    isLoading,
    isError: !!error,
    error,
  };
}
