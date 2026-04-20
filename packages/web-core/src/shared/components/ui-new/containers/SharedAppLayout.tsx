import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { siDiscord, siGithub } from 'simple-icons';
import { XIcon, PlusIcon, LayoutIcon } from '@phosphor-icons/react';
import { SyncErrorProvider } from '@/shared/providers/SyncErrorProvider';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';
import { cn } from '@/shared/lib/utils';
import { isTauriMac } from '@/shared/lib/platform';
import { kanbanProjectsApi } from '@/shared/lib/kanbanApi';

import { NavbarContainer } from './NavbarContainer';
import { AppBar, type AppBarHostStatus } from '@vibe/ui/components/AppBar';
import { MobileDrawer } from '@vibe/ui/components/MobileDrawer';
import { AppBarUserPopoverContainer } from './AppBarUserPopoverContainer';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useAppUpdateStore } from '@/shared/stores/useAppUpdateStore';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';
import {
  getDestinationHostId,
  getProjectDestination,
  isLocalWorkspacesDestination,
} from '@/shared/lib/routes/appNavigation';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import { CommandBarDialog } from '@/shared/dialogs/command-bar/CommandBarDialog';
import { useCommandBarShortcut } from '@/shared/hooks/useCommandBarShortcut';
import { useWorkspaceSidebarPreviewController } from '@/shared/hooks/useWorkspaceSidebarPreviewController';
import { AppBarNotificationBellContainer } from '@/pages/workspaces/AppBarNotificationBellContainer';
import { WorkspacesSidebarContainer } from '@/pages/workspaces/WorkspacesSidebarContainer';
import { WorkspacesSidebarReopenTag } from '@vibe/ui/components/WorkspacesSidebar';
import { useP2pHosts } from '@/shared/hooks/use-p2p-hosts';
import { useDiscordOnlineCount } from '@/shared/hooks/useDiscordOnlineCount';
import { useGitHubStars } from '@/shared/hooks/useGitHubStars';

export function SharedAppLayout() {
  const currentDestination = useCurrentAppDestination();
  const isMobile = useIsMobile();
  const mobileFontScale = useUiPreferencesStore((s) => s.mobileFontScale);
  const isLeftSidebarVisible = useUiPreferencesStore(
    (s) => s.isLeftSidebarVisible
  );
  const { appVersion } = useUserSystem();
  const updateVersion = useAppUpdateStore((s) => s.updateVersion);
  const restartForUpdate = useAppUpdateStore((s) => s.restart);
  const { data: onlineCount } = useDiscordOnlineCount();
  const { data: starCount } = useGitHubStars();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAppBarHovered, setIsAppBarHovered] = useState(false);
  const { pairedHosts: p2pHosts } = useP2pHosts();
  const allHosts = useMemo(
    () =>
      p2pHosts.map((h) => ({
        id: h.machine_id,
        name: h.name,
        status: 'online' as const,
      })),
    [p2pHosts]
  );
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

  // Navigation state for AppBar active indicators
  const projectDestination = useMemo(
    () => getProjectDestination(currentDestination),
    [currentDestination]
  );
  const isWorkspacesActive = isLocalWorkspacesDestination(currentDestination);
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
    void SettingsDialog.show({ initialSection: 'remote-hosts' });
  }, []);

  // Local kanban projects
  const queryClient = useQueryClient();
  const { data: kanbanProjects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ['kanban-projects'],
    queryFn: () => kanbanProjectsApi.list(),
  });
  const appBarProjects = useMemo(
    () =>
      kanbanProjects.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    [kanbanProjects]
  );

  const handleProjectClick = useCallback(
    (projectId: string) => {
      void navigate({ to: '/projects/$projectId', params: { projectId } });
    },
    [navigate]
  );

  const handleCreateProject = useCallback(async () => {
    const name = `Project ${kanbanProjects.length + 1}`;
    const colors = [
      '#6366f1',
      '#f59e0b',
      '#10b981',
      '#ef4444',
      '#8b5cf6',
      '#06b6d4',
    ];
    const color = colors[kanbanProjects.length % colors.length];
    const project = await kanbanProjectsApi.create({
      id: null,
      name,
      color,
    });
    await queryClient.invalidateQueries({ queryKey: ['kanban-projects'] });
    void navigate({
      to: '/projects/$projectId',
      params: { projectId: project.id },
    });
  }, [kanbanProjects, navigate, queryClient]);

  const handleProjectsDragEnd = useCallback(
    async (result: import('@hello-pangea/dnd').DropResult) => {
      if (!result.destination) return;
      const from = result.source.index;
      const to = result.destination.index;
      if (from === to) return;

      // Optimistically reorder in the query cache
      const reordered = [...kanbanProjects];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      queryClient.setQueryData(
        ['kanban-projects'],
        reordered.map((p, i) => ({ ...p, sort_order: i }))
      );

      // Persist new sort_order for each affected project
      await Promise.all(
        reordered.map((p, i) =>
          kanbanProjectsApi.update(p.id, {
            name: null,
            color: null,
            sort_order: i,
          })
        )
      );
      await queryClient.invalidateQueries({ queryKey: ['kanban-projects'] });
    },
    [kanbanProjects, queryClient]
  );

  return (
    <SyncErrorProvider>
      <div
        className={cn(
          'bg-primary',
          isMobile
            ? 'flex fixed inset-0 pb-[env(safe-area-inset-bottom)]'
            : 'grid grid-cols-[auto_1fr] h-screen grid-rows-[auto_1fr]'
        )}
      >
        {!isMobile && (
          <>
            {/* Desktop corner spacer. */}
            <div
              data-tauri-drag-region
              className="bg-secondary"
              style={isTauriMac() ? { minWidth: 56 } : undefined}
            />
            {/* Desktop navbar. */}
            <NavbarContainer
              onOrgSelect={() => {}}
              onOpenDrawer={() => setIsDrawerOpen(true)}
            />
            {/* Desktop AppBar sidebar. */}
            <AppBar
              projects={appBarProjects}
              hosts={allHosts}
              activeHostId={activeHostId}
              onCreateProject={() => void handleCreateProject()}
              onExportClick={() => {}}
              onWorkspacesClick={handleWorkspacesClick}
              onHostClick={handleHostClick}
              onPairHostClick={handlePairHostClick}
              onProjectClick={handleProjectClick}
              onProjectsDragEnd={(r) => void handleProjectsDragEnd(r)}
              isSavingProjectOrder={false}
              isWorkspacesActive={isWorkspacesActive}
              isExportActive={false}
              activeProjectId={activeProjectId}
              isSignedIn={true}
              isLoadingProjects={isLoadingProjects}
              onSignIn={() => handleWorkspacesClick()}
              onHoverStart={() => setIsAppBarHovered(true)}
              onHoverEnd={() => setIsAppBarHovered(false)}
              notificationBell={<AppBarNotificationBellContainer />}
              userPopover={
                <AppBarUserPopoverContainer
                  organizations={[]}
                  selectedOrgId=""
                  onOrgSelect={() => {}}
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
            <NavbarContainer
              mobileMode={isMobile}
              onOrgSelect={() => {}}
              onOpenDrawer={() => setIsDrawerOpen(true)}
            />
            <div className="flex-1 min-h-0 overflow-hidden">
              <Outlet />
            </div>
          </div>
        )}

        {/* Mobile navigation drawer */}
        <MobileDrawer
          open={isDrawerOpen && isMobile}
          onClose={() => setIsDrawerOpen(false)}
        >
          <div className="flex flex-col h-full">
            {/* Header + close button */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="text-sm font-medium text-high truncate">
                Menu
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

            {/* Add more mobile nav items here as needed */}
            {isDrawerOpen && (
              <div className="p-3 border-t border-border mt-auto">
                <button
                  type="button"
                  onClick={() => {
                    void SettingsDialog.show();
                    setIsDrawerOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md text-sm text-low hover:text-normal hover:bg-secondary cursor-pointer"
                >
                  <PlusIcon className="h-4 w-4" />
                  Settings
                </button>
              </div>
            )}
          </div>
        </MobileDrawer>
      </div>
    </SyncErrorProvider>
  );
}
