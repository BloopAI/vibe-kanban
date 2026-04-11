import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DropResult } from '@hello-pangea/dnd';
import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { siDiscord, siGithub } from 'simple-icons';
import {
  XIcon,
  PlusIcon,
  LayoutIcon,
  KanbanIcon,
  DownloadSimpleIcon,
} from '@phosphor-icons/react';
import { SyncErrorProvider } from '@/shared/providers/SyncErrorProvider';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';
import { cn } from '@/shared/lib/utils';
import { isTauriMac } from '@/shared/lib/platform';

import { NavbarContainer } from './NavbarContainer';
import { AppBar, type AppBarHostStatus } from '@vibe/ui/components/AppBar';
import { MobileDrawer } from '@vibe/ui/components/MobileDrawer';
import { AppBarUserPopoverContainer } from './AppBarUserPopoverContainer';
import { useUserOrganizations } from '@/shared/hooks/useUserOrganizations';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useDiscordOnlineCount } from '@/shared/hooks/useDiscordOnlineCount';
import { useGitHubStars } from '@/shared/hooks/useGitHubStars';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useAppUpdateStore } from '@/shared/stores/useAppUpdateStore';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';
import {
  getDestinationHostId,
  getProjectDestination,
  isProjectDestination,
  isLocalWorkspacesDestination,
} from '@/shared/lib/routes/appNavigation';
import {
  CreateRemoteProjectDialog,
  type CreateRemoteProjectResult,
} from '@/shared/dialogs/org/CreateRemoteProjectDialog';
import { OAuthDialog } from '@/shared/dialogs/global/OAuthDialog';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import { CommandBarDialog } from '@/shared/dialogs/command-bar/CommandBarDialog';
import { useCommandBarShortcut } from '@/shared/hooks/useCommandBarShortcut';
import { useWorkspaceSidebarPreviewController } from '@/shared/hooks/useWorkspaceSidebarPreviewController';
import { useShape } from '@/shared/integrations/electric/hooks';
import { sortProjectsByOrder } from '@/shared/lib/projectOrder';
import {
  PROJECT_MUTATION,
  PROJECTS_SHAPE,
  type Project as RemoteProject,
} from 'shared/remote-types';
import { AppBarNotificationBellContainer } from '@/pages/workspaces/AppBarNotificationBellContainer';
import { WorkspacesSidebarContainer } from '@/pages/workspaces/WorkspacesSidebarContainer';
import { WorkspacesSidebarReopenTag } from '@vibe/ui/components/WorkspacesSidebar';
import { useRemoteCloudHostsAppBarModel } from '@/shared/hooks/useRemoteCloudHosts';
import { CloudShutdownExportBanner } from '@/shared/components/CloudShutdownExportBanner';

export function SharedAppLayout() {
  const appNavigation = useAppNavigation();
  const currentDestination = useCurrentAppDestination();
  const isMobile = useIsMobile();
  const mobileFontScale = useUiPreferencesStore((s) => s.mobileFontScale);
  const isLeftSidebarVisible = useUiPreferencesStore(
    (s) => s.isLeftSidebarVisible
  );
  const { isSignedIn } = useAuth();
  const { appVersion } = useUserSystem();
  const updateVersion = useAppUpdateStore((s) => s.updateVersion);
  const restartForUpdate = useAppUpdateStore((s) => s.restart);
  const { data: onlineCount } = useDiscordOnlineCount();
  const { data: starCount } = useGitHubStars();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAppBarHovered, setIsAppBarHovered] = useState(false);
  const { hosts: remoteCloudHosts } = useRemoteCloudHostsAppBarModel();
  const { hostId: routeHostId } = useParams({ strict: false });
  const navigate = useNavigate();

  // Register CMD+K shortcut globally for all routes under SharedAppLayout
  useCommandBarShortcut(() => CommandBarDialog.show());

  // Apply mobile font scale CSS variable
  useEffect(() => {
    if (!isMobile) {
      document.documentElement.style.removeProperty('--mobile-font-scale');
      return;
    }
    const scaleMap = { default: '1', small: '0.9', smaller: '0.8' } as const;
    document.documentElement.style.setProperty(
      '--mobile-font-scale',
      scaleMap[mobileFontScale]
    );
    return () => {
      document.documentElement.style.removeProperty('--mobile-font-scale');
    };
  }, [isMobile, mobileFontScale]);

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
    if (
      prevOrgIdRef.current !== null &&
      prevOrgIdRef.current !== selectedOrgId &&
      selectedOrgId &&
      !isLoading
    ) {
      if (sortedProjects.length > 0) {
        appNavigation.goToProject(sortedProjects[0].id);
      } else {
        appNavigation.goToWorkspaces();
      }
      prevOrgIdRef.current = selectedOrgId;
    } else if (prevOrgIdRef.current === null && selectedOrgId) {
      prevOrgIdRef.current = selectedOrgId;
    }
  }, [selectedOrgId, sortedProjects, isLoading, appNavigation]);

  // Navigation state for AppBar active indicators
  const projectDestination = useMemo(
    () => getProjectDestination(currentDestination),
    [currentDestination]
  );
  const isWorkspacesActive = isLocalWorkspacesDestination(currentDestination);
  const isExportActive = currentDestination?.kind === 'export';
  const showCloudShutdownBanner =
    isExportActive || (isSignedIn && isProjectDestination(currentDestination));
  const isWorkspaceSidebarPreviewEnabled =
    !isMobile && isWorkspacesActive && !isLeftSidebarVisible;
  const activeProjectId = projectDestination?.projectId ?? null;
  const activeHostId =
    getDestinationHostId(currentDestination) ?? routeHostId ?? null;
  const sidebarPreview = useWorkspaceSidebarPreviewController({
    enabled: isWorkspaceSidebarPreviewEnabled,
    isAppBarHovered,
  });

  // Persist last selected project to scratch store
  const setSelectedProjectId = useUiPreferencesStore(
    (s) => s.setSelectedProjectId
  );
  useEffect(() => {
    if (activeProjectId) {
      setSelectedProjectId(activeProjectId);
    }
  }, [activeProjectId, setSelectedProjectId]);

  const handleWorkspacesClick = useCallback(() => {
    void navigate({ to: '/workspaces' });
  }, [navigate]);

  const handleExportClick = useCallback(() => {
    appNavigation.goToExport();
  }, [appNavigation]);

  const handleProjectClick = useCallback(
    (projectId: string) => {
      appNavigation.goToProject(projectId);
    },
    [appNavigation]
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

  const handleCreateProject = useCallback(async () => {
    if (!selectedOrgId) return;

    try {
      const result: CreateRemoteProjectResult =
        await CreateRemoteProjectDialog.show({ organizationId: selectedOrgId });

      if (result.action === 'created' && result.project) {
        appNavigation.goToProject(result.project.id);
      }
    } catch {
      // Dialog cancelled
    }
  }, [selectedOrgId, appNavigation]);

  const handleSignIn = useCallback(async () => {
    try {
      await OAuthDialog.show({});
    } catch {
      // Dialog cancelled
    }
  }, []);

  const openRelaySettings = useCallback((hostId?: string) => {
    void SettingsDialog.show({
      initialSection: 'relay',
      ...(hostId ? { initialState: { hostId } } : {}),
    });
  }, []);

  const handleHostClick = useCallback(
    (hostId: string, status: AppBarHostStatus) => {
      if (status === 'offline') {
        return;
      }

      void navigate({
        to: '/hosts/$hostId/workspaces',
        params: { hostId },
      });
    },
    [navigate]
  );

  const handlePairHostClick = useCallback(() => {
    openRelaySettings();
  }, [openRelaySettings]);

  return (
    <SyncErrorProvider>
      <div
        className={cn(
          'bg-primary',
          isMobile
            ? 'flex fixed inset-0 pb-[env(safe-area-inset-bottom)]'
            : cn(
                'grid grid-cols-[auto_1fr] h-screen',
                showCloudShutdownBanner
                  ? 'grid-rows-[auto_auto_1fr]'
                  : 'grid-rows-[auto_1fr]'
              )
        )}
      >
        {!isMobile && (
          <>
            {showCloudShutdownBanner && (
              <div className="col-span-2">
                <CloudShutdownExportBanner onClick={handleExportClick} />
              </div>
            )}
            {/* Desktop corner spacer. */}
            <div
              data-tauri-drag-region
              className="bg-secondary"
              style={isTauriMac() ? { minWidth: 56 } : undefined}
            />
            {/* Desktop navbar. */}
            <NavbarContainer
              onOrgSelect={setSelectedOrgId}
              onOpenDrawer={() => setIsDrawerOpen(true)}
            />
            {/* Desktop AppBar sidebar. */}
            <AppBar
              projects={orderedProjects}
              hosts={remoteCloudHosts}
              activeHostId={activeHostId}
              onCreateProject={handleCreateProject}
              onExportClick={handleExportClick}
              onWorkspacesClick={handleWorkspacesClick}
              onHostClick={handleHostClick}
              onPairHostClick={handlePairHostClick}
              onProjectClick={handleProjectClick}
              onProjectsDragEnd={handleProjectsDragEnd}
              isSavingProjectOrder={isSavingProjectOrder}
              isWorkspacesActive={isWorkspacesActive}
              isExportActive={isExportActive}
              activeProjectId={activeProjectId}
              isSignedIn={isSignedIn}
              isLoadingProjects={isLoading}
              onSignIn={handleSignIn}
              onHoverStart={() => setIsAppBarHovered(true)}
              onHoverEnd={() => setIsAppBarHovered(false)}
              notificationBell={
                isSignedIn ? <AppBarNotificationBellContainer /> : undefined
              }
              userPopover={
                <AppBarUserPopoverContainer
                  organizations={organizations}
                  selectedOrgId={selectedOrgId ?? ''}
                  onOrgSelect={setSelectedOrgId}
                />
              }
              starCount={starCount}
              onlineCount={onlineCount}
              appVersion={appVersion}
              updateVersion={updateVersion}
              onUpdateClick={restartForUpdate ?? undefined}
              githubIconPath={siGithub.path}
              discordIconPath={siDiscord.path}
            />
            {/* Desktop content. */}
            <div className="relative min-h-0 overflow-hidden">
              {isWorkspaceSidebarPreviewEnabled && (
                <div className="absolute inset-y-0 left-0 z-20 flex items-center">
                  <WorkspacesSidebarReopenTag
                    active={sidebarPreview.isPreviewOpen}
                    onHoverStart={sidebarPreview.handleHandleHoverStart}
                    onHoverEnd={sidebarPreview.handleHandleHoverEnd}
                    ariaLabel="Workspaces"
                  />
                </div>
              )}

              {isWorkspaceSidebarPreviewEnabled && (
                <div
                  className={cn(
                    'absolute left-0 top-0 z-30 h-full w-[300px] transition-transform duration-150 ease-out',
                    sidebarPreview.isPreviewOpen
                      ? 'translate-x-0 pointer-events-auto'
                      : '-translate-x-full pointer-events-none'
                  )}
                  onMouseEnter={sidebarPreview.handlePreviewHoverStart}
                  onMouseLeave={sidebarPreview.handlePreviewHoverEnd}
                >
                  <div className="h-full w-full overflow-hidden border-r border-border bg-secondary shadow-lg">
                    <WorkspacesSidebarContainer />
                  </div>
                </div>
              )}

              <Outlet />
            </div>
          </>
        )}

        {isMobile && (
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {showCloudShutdownBanner && (
              <CloudShutdownExportBanner onClick={handleExportClick} />
            )}
            <NavbarContainer
              mobileMode={isMobile}
              onOrgSelect={setSelectedOrgId}
              onOpenDrawer={() => setIsDrawerOpen(true)}
            />
            <div className="flex-1 min-h-0 overflow-hidden">
              <Outlet />
            </div>
          </div>
        )}

        {/* Mobile project navigation drawer */}
        <MobileDrawer
          open={isDrawerOpen && isMobile}
          onClose={() => setIsDrawerOpen(false)}
        >
          <div className="flex flex-col h-full">
            {/* Header: org name + close button */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="text-sm font-medium text-high truncate">
                {organizations.find((o) => o.id === selectedOrgId)?.name ??
                  'Organization'}
              </span>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-sm text-low hover:text-normal cursor-pointer"
              >
                <XIcon className="h-4 w-4" weight="bold" />
              </button>
            </div>

            {/* Workspaces link */}
            <button
              type="button"
              onClick={() => {
                void navigate({ to: '/workspaces' });
                setIsDrawerOpen(false);
              }}
              className="flex items-center gap-2 px-4 py-3 text-sm text-normal hover:bg-secondary cursor-pointer"
            >
              <LayoutIcon className="h-4 w-4" />
              Workspaces
            </button>

            {/* Divider */}
            <div className="border-t border-border mx-4" />

            {/* Export link */}
            {isSignedIn && (
              <div className="px-4 py-3">
                <p className="mb-2 text-xs font-medium text-low">Export</p>
                <button
                  type="button"
                  onClick={() => {
                    handleExportClick();
                    setIsDrawerOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-normal hover:bg-secondary cursor-pointer"
                >
                  <DownloadSimpleIcon className="h-4 w-4" />
                  Export data
                </button>
              </div>
            )}

            {/* Divider */}
            {isSignedIn && <div className="border-t border-border mx-4" />}

            {/* Project list */}
            <div className="flex-1 overflow-y-auto p-2">
              {isSignedIn ? (
                orderedProjects.map((project) => (
                  <button
                    type="button"
                    key={project.id}
                    onClick={() => {
                      handleProjectClick(project.id);
                      setIsDrawerOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-left cursor-pointer',
                      'transition-colors',
                      project.id === activeProjectId
                        ? 'bg-brand/10 text-high'
                        : 'text-normal hover:bg-secondary'
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(${project.color})` }}
                    />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-center">
                  <KanbanIcon
                    className="h-8 w-8 mx-auto text-low"
                    weight="bold"
                  />
                  <p className="mt-3 text-sm font-medium text-high">
                    Kanban Boards
                  </p>
                  <p className="mt-1 text-xs text-low">
                    Sign in to organise your coding agents with kanban boards.
                  </p>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        handleSignIn();
                        setIsDrawerOpen(false);
                      }}
                      className="w-full px-3 py-2 rounded-md text-sm font-medium bg-brand text-on-brand hover:bg-brand-hover cursor-pointer"
                    >
                      Sign in
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Create Project button */}
            {isSignedIn && (
              <div className="p-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    handleCreateProject();
                    setIsDrawerOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md text-sm text-low hover:text-normal hover:bg-secondary cursor-pointer"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create Project
                </button>
              </div>
            )}
          </div>
        </MobileDrawer>
      </div>
    </SyncErrorProvider>
  );
}
