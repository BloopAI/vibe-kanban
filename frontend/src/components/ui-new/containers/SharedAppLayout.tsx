import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SyncErrorProvider } from '@/contexts/SyncErrorContext';
import { NavbarContainer } from './NavbarContainer';
import { AppBar } from '../primitives/AppBar';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationProjects } from '@/hooks/useOrganizationProjects';

export function SharedAppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // AppBar state - organizations and projects
  const { data: orgsData } = useUserOrganizations();
  const organizations = orgsData?.organizations ?? [];
  const firstOrg = organizations[0];

  const [selectedOrgId, setSelectedOrgId] = useState<string>('');

  useEffect(() => {
    if (firstOrg && !selectedOrgId) {
      setSelectedOrgId(firstOrg.id);
    }
  }, [firstOrg, selectedOrgId]);

  const { data: orgProjects = [] } = useOrganizationProjects(
    selectedOrgId || null
  );

  // Navigation state for AppBar active indicators
  const isWorkspacesActive = location.pathname.startsWith('/workspaces');
  const activeProjectId = location.pathname.startsWith('/projects/')
    ? location.pathname.split('/')[2]
    : null;

  const handleWorkspacesClick = useCallback(() => {
    navigate('/workspaces');
  }, [navigate]);

  const handleProjectClick = useCallback(
    (projectId: string) => {
      navigate(`/projects/${projectId}`);
    },
    [navigate]
  );

  const handleCreateOrg = useCallback(() => {
    // TODO: Implement create organization dialog
  }, []);

  return (
    <SyncErrorProvider>
      <div className="flex h-screen bg-primary">
        <AppBar
          projects={orgProjects}
          organizations={organizations}
          selectedOrgId={selectedOrgId}
          onOrgSelect={setSelectedOrgId}
          onCreateOrg={handleCreateOrg}
          onWorkspacesClick={handleWorkspacesClick}
          onProjectClick={handleProjectClick}
          isWorkspacesActive={isWorkspacesActive}
          activeProjectId={activeProjectId}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <NavbarContainer />
          <div className="flex-1 min-h-0">
            <Outlet />
          </div>
        </div>
      </div>
    </SyncErrorProvider>
  );
}
