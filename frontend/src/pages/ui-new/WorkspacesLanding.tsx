import { Navigate } from 'react-router-dom';
import { useWorkspaces } from '@/components/ui-new/hooks/useWorkspaces';

export function WorkspacesLanding() {
  const { workspaces, isLoading } = useWorkspaces();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-primary">
        <p className="text-low">Loading workspaces...</p>
      </div>
    );
  }

  // If no workspaces exist, redirect to create
  if (workspaces.length === 0) {
    return <Navigate to="/workspaces/create" replace />;
  }

  // Otherwise redirect to most recent/first workspace
  const mostRecentWorkspace = workspaces[0];
  return <Navigate to={`/workspaces/${mostRecentWorkspace.id}`} replace />;
}
