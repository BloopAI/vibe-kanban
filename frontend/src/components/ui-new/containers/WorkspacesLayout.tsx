import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Group,
  Panel,
  Separator,
  type PanelImperativeHandle,
  type PanelSize,
} from 'react-resizable-panels';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import { WorkspacesMain } from '@/components/ui-new/views/WorkspacesMain';
import { GitPanel, type RepoInfo } from '@/components/ui-new/views/GitPanel';
import { Navbar } from '@/components/ui-new/views/Navbar';
import { useRenameBranch } from '@/hooks/useRenameBranch';

export function WorkspacesLayout() {
  const {
    workspace: selectedWorkspace,
    workspaceId: selectedWorkspaceId,
    sidebarWorkspaces,
    archivedSidebarWorkspaces,
    isLoading,
    isCreateMode,
    selectWorkspace,
    navigateToCreate,
    selectedSession,
    selectedSessionId,
    sessions,
    selectSession,
    repos,
  } = useWorkspaceContext();
  const [searchQuery, setSearchQuery] = useState('');

  // Hook to rename branch via API
  const renameBranch = useRenameBranch(selectedWorkspace?.id);

  const handleBranchNameChange = useCallback(
    (newName: string) => {
      renameBranch.mutate(newName);
    },
    [renameBranch]
  );

  // Transform repos to RepoInfo format for GitPanel
  const repoInfos: RepoInfo[] = useMemo(
    () =>
      repos.map((repo) => ({
        id: repo.id,
        name: repo.display_name || repo.name,
        currentBranch: selectedWorkspace?.branch ?? '',
        commitsAhead: 0, // Mock for now
        filesChanged: 0, // Mock for now
        linesAdded: 0, // Mock for now
        linesRemoved: 0, // Mock for now
      })),
    [repos, selectedWorkspace?.branch]
  );

  // Panel refs for programmatic collapse/expand
  const sidebarRef = useRef<PanelImperativeHandle>(null);
  const gitPanelRef = useRef<PanelImperativeHandle>(null);

  // Track collapsed state for navbar button active states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isGitPanelCollapsed, setIsGitPanelCollapsed] = useState(false);

  // Panel toggle handlers
  const handleToggleSidebar = useCallback(() => {
    if (sidebarRef.current?.isCollapsed()) {
      sidebarRef.current.expand();
    } else {
      sidebarRef.current?.collapse();
    }
  }, []);

  const handleToggleGitPanel = useCallback(() => {
    if (gitPanelRef.current?.isCollapsed()) {
      gitPanelRef.current.expand();
    } else {
      gitPanelRef.current?.collapse();
    }
  }, []);

  // Panel resize handlers to track collapsed state
  const handleSidebarResize = useCallback((size: PanelSize) => {
    setIsSidebarCollapsed(size.inPixels === 0);
  }, []);

  const handleGitPanelResize = useCallback((size: PanelSize) => {
    setIsGitPanelCollapsed(size.inPixels === 0);
  }, []);

  const navbarTitle = isCreateMode
    ? 'Create Workspace'
    : selectedWorkspace?.branch;

  return (
    <div className="flex flex-col h-screen">
      <Navbar
        workspaceTitle={navbarTitle}
        isSidebarVisible={!isSidebarCollapsed}
        isGitPanelVisible={!isCreateMode && !isGitPanelCollapsed}
        onToggleSidebar={handleToggleSidebar}
        onToggleGitPanel={isCreateMode ? undefined : handleToggleGitPanel}
      />
      <Group orientation="horizontal" className="flex-1 min-h-0">
        <Panel
          id="sidebar"
          defaultSize="300px"
          minSize="300px"
          maxSize="600px"
          className="min-w-0 min-h-0 overflow-hidden"
          collapsible={true}
          collapsedSize="0px"
          panelRef={sidebarRef}
          onResize={handleSidebarResize}
        >
          <WorkspacesSidebar
            workspaces={sidebarWorkspaces}
            archivedWorkspaces={archivedSidebarWorkspaces}
            selectedWorkspaceId={selectedWorkspaceId ?? null}
            onSelectWorkspace={selectWorkspace}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onAddWorkspace={navigateToCreate}
          />
        </Panel>

        <Separator id="handle-left" />

        <Panel id="main" className="min-w-0 min-h-0 overflow-hidden">
          {isCreateMode ? (
            <div className="flex h-full items-center justify-center bg-primary">
              <div className="text-center">
                <h1 className="text-xl text-high mb-4">Create New Workspace</h1>
                <p className="text-low">
                  Workspace creation form coming soon...
                </p>
              </div>
            </div>
          ) : (
            <ExecutionProcessesProvider
              attemptId={selectedWorkspace?.id}
              sessionId={selectedSessionId}
            >
              <WorkspacesMain
                selectedWorkspace={selectedWorkspace ?? null}
                selectedSession={selectedSession}
                sessions={sessions}
                onSelectSession={selectSession}
                isLoading={isLoading}
              />
            </ExecutionProcessesProvider>
          )}
        </Panel>

        {!isCreateMode && (
          <>
            <Separator id="handle-right" />

            <Panel
              id="git"
              defaultSize="300px"
              minSize="300px"
              maxSize="600px"
              className="min-w-0 min-h-0 overflow-hidden"
              collapsible={true}
              collapsedSize="0px"
              panelRef={gitPanelRef}
              onResize={handleGitPanelResize}
            >
              <GitPanel
                repos={repoInfos}
                workingBranchName={selectedWorkspace?.branch ?? ''}
                onWorkingBranchNameChange={handleBranchNameChange}
                onActionsClick={(repoId, action) =>
                  console.log('Actions clicked:', repoId, 'action:', action)
                }
                onAddRepo={() => console.log('Add repo clicked')}
              />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}
