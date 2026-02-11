import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SyncErrorProvider } from '@/contexts/SyncErrorContext';

import { NavbarContainer } from './NavbarContainer';
import { AppBar } from '../primitives/AppBar';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationProjects } from '@/hooks/useOrganizationProjects';
import { useOrganizationStore } from '@/stores/useOrganizationStore';
import { useAuth } from '@/hooks/auth/useAuth';
import {
  CreateOrganizationDialog,
  type CreateOrganizationResult,
  CreateRemoteProjectDialog,
  type CreateRemoteProjectResult,
} from '@/components/dialogs';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { useCommandBarShortcut } from '@/hooks/useCommandBarShortcut';

export function SharedAppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMigrateRoute = location.pathname.startsWith('/migrate');
  const { isSignedIn } = useAuth();

  // Register CMD+K shortcut globally for all routes under SharedAppLayout
  useCommandBarShortcut(() => CommandBarDialog.show());

  // AppBar state - organizations and projects
  const { data: orgsData } = useUserOrganizations();
  const organizations = useMemo(
    () => orgsData?.organizations ?? [],
    [orgsData?.organizations]
  );

  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const prevOrgIdRef = useRef<string | null>(null);

  // Auto-select first org if none selected or selection is invalid
  useEffect(() => {
    if (organizations.length === 0) return;

    const hasValidSelection = selectedOrgId
      ? organizations.some((org) => org.id === selectedOrgId)
      : false;

    if (!selectedOrgId || !hasValidSelection) {
      const firstNonPersonal = organizations.find((org) => !org.is_personal);
      setSelectedOrgId((firstNonPersonal ?? organizations[0]).id);
    }
  }, [organizations, selectedOrgId, setSelectedOrgId]);

  const { data: orgProjects = [], isLoading } = useOrganizationProjects(
    selectedOrgId || null
  );

  // Navigate to latest project when org changes
  useEffect(() => {
    // Skip auto-navigation when on migration flow
    if (isMigrateRoute) {
      prevOrgIdRef.current = selectedOrgId;
      return;
    }

    if (
      prevOrgIdRef.current !== null &&
      prevOrgIdRef.current !== selectedOrgId &&
      selectedOrgId &&
      !isLoading
    ) {
      if (orgProjects.length > 0) {
        const sortedProjects = [...orgProjects].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        navigate(`/projects/${sortedProjects[0].id}`);
      } else {
        navigate('/workspaces');
      }
      prevOrgIdRef.current = selectedOrgId;
    } else if (prevOrgIdRef.current === null && selectedOrgId) {
      prevOrgIdRef.current = selectedOrgId;
    }
  }, [selectedOrgId, orgProjects, isLoading, navigate, isMigrateRoute]);

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

  const handleCreateOrg = useCallback(async () => {
    try {
      const result: CreateOrganizationResult =
        await CreateOrganizationDialog.show();

      if (result.action === 'created' && result.organizationId) {
        setSelectedOrgId(result.organizationId);
      }
    } catch {
      // Dialog cancelled
    }
  }, [setSelectedOrgId]);

  const handleCreateProject = useCallback(async () => {
    if (!selectedOrgId) return;

    try {
      const result: CreateRemoteProjectResult =
        await CreateRemoteProjectDialog.show({ organizationId: selectedOrgId });

      if (result.action === 'created' && result.project) {
        navigate(`/projects/${result.project.id}`);
      }
    } catch {
      // Dialog cancelled
    }
  }, [navigate, selectedOrgId]);

  const handleSignIn = useCallback(async () => {
    try {
      await OAuthDialog.show({});
    } catch {
      // Dialog cancelled
    }
  }, []);

  const handleMigrate = useCallback(async () => {
    if (!isSignedIn) {
      try {
        const profile = await OAuthDialog.show({});
        if (profile) {
          navigate('/migrate');
        }
      } catch {
        // Dialog cancelled
      }
    } else {
      navigate('/migrate');
    }
  }, [isSignedIn, navigate]);

  return (
    <SyncErrorProvider>
      <div className="flex h-screen bg-primary">
        {!isMigrateRoute && (
          <AppBar
            projects={orgProjects}
            organizations={organizations}
            selectedOrgId={selectedOrgId ?? ''}
            onOrgSelect={setSelectedOrgId}
            onCreateOrg={handleCreateOrg}
            onCreateProject={handleCreateProject}
            onWorkspacesClick={handleWorkspacesClick}
            onProjectClick={handleProjectClick}
            isWorkspacesActive={isWorkspacesActive}
            activeProjectId={activeProjectId}
            isSignedIn={isSignedIn}
            isLoadingProjects={isLoading}
            onSignIn={handleSignIn}
            onMigrate={handleMigrate}
          />
        )}
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
