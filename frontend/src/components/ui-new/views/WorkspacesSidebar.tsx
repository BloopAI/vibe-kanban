import { PlusIcon } from '@phosphor-icons/react';
import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { WorkspaceSummary } from '@/components/ui-new/primitives/WorkspaceSummary';

interface WorkspacesSidebarProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace?: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function WorkspacesSidebar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  searchQuery,
  onSearchChange,
}: WorkspacesSidebarProps) {
  const filteredWorkspaces = workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="w-full h-full bg-secondary flex flex-col gap-double pt-double px-double text-low">
      <h2 className="text-high">Active Workspaces</h2>
      <InputField
        variant="search"
        value={searchQuery}
        onChange={onSearchChange}
        actionIcon={PlusIcon}
        onAction={onAddWorkspace}
        placeholder="Search..."
      />

      {filteredWorkspaces.map((workspace) => (
        <WorkspaceSummary
          key={workspace.id}
          name={workspace.name}
          filesChanged={workspace.filesChanged}
          linesAdded={workspace.linesAdded}
          linesRemoved={workspace.linesRemoved}
          isActive={selectedWorkspaceId === workspace.id}
          isRunning={workspace.isRunning}
          isPinned={workspace.isPinned}
          onClick={() => onSelectWorkspace(workspace.id)}
        />
      ))}
      <div>
        <h2>Archived Workspaces</h2>
      </div>
    </aside>
  );
}
