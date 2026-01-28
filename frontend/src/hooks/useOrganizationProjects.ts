import { useEntity } from '@/lib/electric/hooks';
import { PROJECT_ENTITY } from 'shared/remote-types';
import { useAuth } from '@/hooks/auth/useAuth';

export function useOrganizationProjects(organizationId: string | null) {
  const { isSignedIn } = useAuth();

  // Only subscribe to Electric when signed in AND have an org
  const enabled = isSignedIn && !!organizationId;

  const { data, isLoading, error } = useEntity(
    PROJECT_ENTITY,
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
