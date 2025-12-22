import { PlusIcon } from '@phosphor-icons/react';
import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';
import { CollapsibleSection } from '@/components/ui-new/primitives/CollapsibleSection';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { WorkspaceSummary } from '@/components/ui-new/primitives/WorkspaceSummary';
import { SectionHeader } from '../primitives/SectionHeader';

interface WorkspacesSidebarProps {
  workspaces: Workspace[];
  archivedWorkspaces?: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace?: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function WorkspacesSidebar({
  workspaces,
  archivedWorkspaces = [],
  selectedWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  searchQuery,
  onSearchChange,
}: WorkspacesSidebarProps) {
  const searchLower = searchQuery.toLowerCase();

  const filteredWorkspaces = workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(searchLower)
  );

  const filteredArchivedWorkspaces = archivedWorkspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(searchLower)
  );

  return (
    <aside className="w-full h-full bg-secondary flex flex-col gap-double pt-double px-double text-low">
      <SectionHeader
        title="Workspaces"
        icon={PlusIcon}
        onIconClick={onAddWorkspace}
      />
      <InputField
        variant="search"
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Search..."
      />
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-double">
        <CollapsibleSection
          title="Active"
          defaultExpanded
          className="gap-double"
        >
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
        </CollapsibleSection>
        <CollapsibleSection title="Archived" defaultExpanded={false}>
          {filteredArchivedWorkspaces.map((workspace) => (
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
        </CollapsibleSection>
      </div>
    </aside>
  );
}
