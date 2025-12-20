import { PlusIcon } from '@phosphor-icons/react';
import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';
import { CollapsibleSection } from '@/components/ui-new/primitives/CollapsibleSection';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { WorkspaceSummary } from '@/components/ui-new/primitives/WorkspaceSummary';
import { SectionHeader } from '../primitives/SectionHeader';

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
      <CollapsibleSection title="Active" defaultExpanded>
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
      <CollapsibleSection title="Archived" defaultExpanded>
        {/* Archived workspaces content */}
      </CollapsibleSection>
    </aside>
  );
}
