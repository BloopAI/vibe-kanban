import { Navigate } from '@tanstack/react-router';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

export function WorkspacesLanding() {
  const appNavigation = useAppNavigation();
  return <Navigate {...appNavigation.toWorkspacesCreate()} replace />;
}
