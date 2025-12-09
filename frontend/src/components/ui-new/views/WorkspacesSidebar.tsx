import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';
import { WorkspaceSearch } from '@/components/ui-new/primitives/Field';
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
    <aside className="w-80 bg-secondary shrink-0 px-double">
      <WorkspaceSearch
        value={searchQuery}
        onValueChange={onSearchChange}
        onAdd={onAddWorkspace}
        className="my-double"
      />
      <nav>
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
            className="my-double"
          />
        ))}
      </nav>
    </aside>
  );
}
