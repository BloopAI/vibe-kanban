import { Navigate } from '@tanstack/react-router';
import { toWorkspacesCreate } from '@/shared/lib/routes/navigation';

export function WorkspacesLanding() {
  return <Navigate {...toWorkspacesCreate()} replace />;
}
