import type { Workspace } from '../hooks/useWorkspaces';

interface WorkspacesSidebarProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
}

export function WorkspacesSidebar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
}: WorkspacesSidebarProps) {
  return (
    <aside className="w-64 bg-secondary shrink-0 p-base">
      <h2 className="mb-padding text-sm font-semibold uppercase tracking-wide text-low">
        Workspaces
      </h2>
      <nav className="space-y-1">
        {workspaces.map((workspace) => (
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
