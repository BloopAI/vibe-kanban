import { useState, useCallback } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels';
import { useWorkspaces } from '@/components/ui-new/hooks/useWorkspaces';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import { WorkspacesMain } from '@/components/ui-new/views/WorkspacesMain';
import { GitPanel, type RepoInfo } from '@/components/ui-new/views/GitPanel';

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
  const { workspaces, selectedWorkspaceId, selectWorkspace, isLoading } =
    useWorkspaces();
  const [searchQuery, setSearchQuery] = useState('');
  const [chatValue, setChatValue] = useState('');
  const [workingBranchName, setWorkingBranchName] = useState('');

  const selectedWorkspace =
    workspaces.find((w) => w.id === selectedWorkspaceId) ?? null;

  const handleSend = useCallback(() => {
    if (chatValue.trim()) {
      // TODO: Implement send functionality
      console.log('Sending:', chatValue);
      setChatValue('');
    }
  }, [chatValue]);

  const { defaultLayout, onLayoutChange } = useDefaultLayout({
    groupId: 'workspacesLayout',
    storage: localStorage,
  });

  return (
    <Group
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
      className="min-h-screen"
    >
      <Panel
        id="sidebar"
        defaultSize="300px"
        minSize="300px"
        maxSize="600px"
        className="min-w-0 min-h-0 overflow-hidden"
        collapsible={true}
      >
        <WorkspacesSidebar
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={selectWorkspace}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </Panel>

      <Separator id="handle-left" />

      <Panel id="main" className="min-w-0 min-h-0 overflow-hidden">
        <WorkspacesMain
          selectedWorkspace={selectedWorkspace}
          isLoading={isLoading}
          chatValue={chatValue}
          onChatChange={setChatValue}
          onSend={handleSend}
        />
      </Panel>

      <Separator id="handle-right" />

      <Panel
        id="git"
        defaultSize="300px"
        minSize="300px"
        maxSize="600px"
        className="min-w-0 min-h-0 overflow-hidden"
        collapsible={true}
      >
        <GitPanel
          repos={mockRepos}
          workingBranchName={workingBranchName}
          onWorkingBranchNameChange={setWorkingBranchName}
          onActionsClick={(repoId) => console.log('Actions clicked:', repoId)}
          onAddRepo={() => console.log('Add repo clicked')}
        />
      </Panel>
    </Group>
  );
}
