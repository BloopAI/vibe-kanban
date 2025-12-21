import { useState, useCallback, useRef } from 'react';
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

// Mock data for the git panel - replace with real data from hooks/API
const mockRepos: RepoInfo[] = [
  {
    id: '1',
    name: 'Vibe Kanban',
    currentBranch: 'Main',
    commitsAhead: 1,
    filesChanged: 3,
    linesAdded: 300,
    linesRemoved: 136,
  },
  {
    id: '2',
    name: 'Vibe Kanban/api',
    currentBranch: 'Main',
    commitsAhead: 1,
    filesChanged: 3,
    linesAdded: 300,
    linesRemoved: 136,
  },
];

export function WorkspacesLayout() {
  const {
    workspace: selectedWorkspace,
    workspaceId: selectedWorkspaceId,
    sidebarWorkspaces,
    isLoading,
    isCreateMode,
    selectWorkspace,
    navigateToCreate,
    selectedSession,
    selectedSessionId,
    sessions,
    selectSession,
  } = useWorkspaceContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [chatValue, setChatValue] = useState('');
  const [workingBranchName, setWorkingBranchName] = useState('');

  // Panel refs for programmatic collapse/expand
  const sidebarRef = useRef<PanelImperativeHandle>(null);
  const gitPanelRef = useRef<PanelImperativeHandle>(null);

  // Track collapsed state for navbar button active states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isGitPanelCollapsed, setIsGitPanelCollapsed] = useState(false);

  const handleSend = useCallback(() => {
    if (chatValue.trim()) {
      // TODO: Implement send functionality
      console.log('Sending:', chatValue);
      setChatValue('');
    }
  }, [chatValue]);

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
                chatValue={chatValue}
                onChatChange={setChatValue}
                onSend={handleSend}
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
                repos={mockRepos}
                workingBranchName={workingBranchName}
                onWorkingBranchNameChange={setWorkingBranchName}
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
