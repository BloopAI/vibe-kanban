import { Navigate } from 'react-router-dom';

export function WorkspacesLanding() {
  return <Navigate to="/workspaces/create" replace />;
}
