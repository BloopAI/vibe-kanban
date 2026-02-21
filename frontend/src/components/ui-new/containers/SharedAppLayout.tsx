import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DropResult } from '@hello-pangea/dnd';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { SyncErrorProvider } from '@/contexts/SyncErrorContext';

import { NavbarContainer } from './NavbarContainer';
import { AppBar } from '../primitives/AppBar';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationStore } from '@/stores/useOrganizationStore';
import { useAuth } from '@/hooks/auth/useAuth';
import {
  buildProjectRootPath,
  parseProjectSidebarRoute,
} from '@/lib/routes/projectSidebarRoutes';
import {
  CreateOrganizationDialog,
  type CreateOrganizationResult,
  CreateRemoteProjectDialog,
  type CreateRemoteProjectResult,
} from '@/components/dialogs';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { useCommandBarShortcut } from '@/hooks/useCommandBarShortcut';
import { useShape } from '@/lib/electric/hooks';
import { sortProjectsByOrder } from '@/lib/projectOrder';
import { resolveAppPath } from '@/lib/routes/pathResolution';
import {
  PROJECT_MUTATION,
  PROJECTS_SHAPE,
  type Project as RemoteProject,
} from 'shared/remote-types';
import { toMigrate, toProject, toWorkspaces } from '@/lib/routes/navigation';

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
  const projectLastPathRef = useRef<Record<string, string>>({});

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

  const projectParams = useMemo(
    () => ({ organization_id: selectedOrgId || '' }),
    [selectedOrgId]
  );
  const {
    data: orgProjects = [],
    isLoading,
    updateMany: updateManyProjects,
  } = useShape(PROJECTS_SHAPE, projectParams, {
    enabled: isSignedIn && !!selectedOrgId,
    mutation: PROJECT_MUTATION,
  });
  const sortedProjects = useMemo(
    () => sortProjectsByOrder(orgProjects),
    [orgProjects]
  );
  const [orderedProjects, setOrderedProjects] =
    useState<RemoteProject[]>(sortedProjects);
  const [isSavingProjectOrder, setIsSavingProjectOrder] = useState(false);

  useEffect(() => {
    if (isSavingProjectOrder) {
      return;
    }
    setOrderedProjects(sortedProjects);
  }, [isSavingProjectOrder, sortedProjects]);

  // Navigate to the first ordered project when org changes
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
      if (sortedProjects.length > 0) {
        navigate(toProject(sortedProjects[0].id));
      } else {
        navigate(toWorkspaces());
      }
      prevOrgIdRef.current = selectedOrgId;
    } else if (prevOrgIdRef.current === null && selectedOrgId) {
      prevOrgIdRef.current = selectedOrgId;
    }
  }, [selectedOrgId, sortedProjects, isLoading, navigate, isMigrateRoute]);

  // Navigation state for AppBar active indicators
  const isWorkspacesActive = location.pathname.startsWith('/workspaces');
  const activeProjectId = location.pathname.startsWith('/projects/')
    ? location.pathname.split('/')[2]
    : null;

  // Remember the last visited route for each project so AppBar clicks can
  // reopen the previous issue/workspace selection.
  useEffect(() => {
    const route = parseProjectSidebarRoute(location.pathname);
    if (!route) {
      return;
    }

    const pathWithSearch = `${location.pathname}${location.searchStr}`;
    projectLastPathRef.current[route.projectId] = pathWithSearch;
  }, [location.pathname, location.searchStr]);

  const handleWorkspacesClick = useCallback(() => {
    navigate(toWorkspaces());
  }, [navigate]);

  const handleProjectClick = useCallback(
    (projectId: string) => {
      const rememberedPath = projectLastPathRef.current[projectId];
      if (rememberedPath) {
        const resolvedPath = resolveAppPath(rememberedPath);
        if (resolvedPath) {
          navigate(resolvedPath);
          return;
        }
      }

      navigate(buildProjectRootPath(projectId));
    },
    [navigate]
  );

  const handleProjectsDragEnd = useCallback(
    async ({ source, destination }: DropResult) => {
      if (isSavingProjectOrder) {
        return;
      }
      if (!destination || source.index === destination.index) {
        return;
      }

      const previousOrder = orderedProjects;
      const reordered = [...orderedProjects];
      const [moved] = reordered.splice(source.index, 1);

      if (!moved) {
        return;
      }

      reordered.splice(destination.index, 0, moved);
      setOrderedProjects(reordered);
      setIsSavingProjectOrder(true);

      try {
        await updateManyProjects(
          reordered.map((project, index) => ({
            id: project.id,
            changes: { sort_order: index },
          }))
        ).persisted;
      } catch (error) {
        console.error('Failed to reorder projects:', error);
        setOrderedProjects(previousOrder);
      } finally {
        setIsSavingProjectOrder(false);
      }
    },
    [isSavingProjectOrder, orderedProjects, updateManyProjects]
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
        navigate(toProject(result.project.id));
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
          navigate(toMigrate());
        }
      } catch {
        // Dialog cancelled
      }
    } else {
      navigate(toMigrate());
    }
  }, [isSignedIn, navigate]);

  return (
    <SyncErrorProvider>
      <div className="flex h-screen bg-primary">
        {!isMigrateRoute && (
          <AppBar
            projects={orderedProjects}
            organizations={organizations}
            selectedOrgId={selectedOrgId ?? ''}
            onOrgSelect={setSelectedOrgId}
            onCreateOrg={handleCreateOrg}
            onCreateProject={handleCreateProject}
            onWorkspacesClick={handleWorkspacesClick}
            onProjectClick={handleProjectClick}
            onProjectsDragEnd={handleProjectsDragEnd}
            isSavingProjectOrder={isSavingProjectOrder}
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
