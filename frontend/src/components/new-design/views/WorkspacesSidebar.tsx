import type { Workspace } from '../hooks/useWorkspaces';
import { WorkspaceSearch } from '@/components/ui-new/Field';

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
    <aside className="w-64 bg-secondary shrink-0 p-base">
      <WorkspaceSearch
        value={searchQuery}
        onValueChange={onSearchChange}
        onAdd={onAddWorkspace}
        className="mb-base"
      />
      <nav className="space-y-1">
        {filteredWorkspaces.map((workspace) => (
          <button
            key={workspace.id}
            onClick={() => onSelectWorkspace(workspace.id)}
            className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
              selectedWorkspaceId === workspace.id
                ? 'bg-accent text-high'
                : 'text-normal hover:bg-tertiary'
            }`}
          >
            <div className="font-medium">{workspace.name}</div>
            <div className="text-xs text-low">{workspace.description}</div>
          </button>
        ))}
      </nav>
    </aside>
  );
}
