import { useState } from 'react';
import { useWorkspaces } from '@/components/ui-new/hooks/useWorkspaces';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import { WorkspacesMain } from '@/components/ui-new/views/WorkspacesMain';

export function WorkspacesLayout() {
  const { workspaces, selectedWorkspaceId, selectWorkspace, isLoading } =
    useWorkspaces();
  const [searchQuery, setSearchQuery] = useState('');

  const selectedWorkspace =
    workspaces.find((w) => w.id === selectedWorkspaceId) ?? null;

  return (
    <div className="flex min-h-screen divide-x divide-border">
      <WorkspacesSidebar
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={selectWorkspace}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <WorkspacesMain
        selectedWorkspace={selectedWorkspace}
        isLoading={isLoading}
      />
    </div>
  );
}
