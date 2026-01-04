import { PlusIcon } from '@phosphor-icons/react';
import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';
import { CollapsibleSection } from '@/components/ui-new/primitives/CollapsibleSection';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { WorkspaceSummary } from '@/components/ui-new/primitives/WorkspaceSummary';
import { SectionHeader } from '../primitives/SectionHeader';
import { PERSIST_KEYS } from '@/stores/useUiPreferencesStore';

interface WorkspacesSidebarProps {
  workspaces: Workspace[];
  archivedWorkspaces?: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace?: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onDeleteWorkspace?: (taskId: string) => void;
  onArchiveWorkspace?: (workspaceId: string, isArchived: boolean) => void;
  onPinWorkspace?: (workspaceId: string, isPinned: boolean) => void;
  onDuplicateWorkspace?: (workspaceId: string) => void;
}

export function WorkspacesSidebar({
  workspaces,
  archivedWorkspaces = [],
  selectedWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  searchQuery,
  onSearchChange,
  onDeleteWorkspace,
  onArchiveWorkspace,
  onPinWorkspace,
  onDuplicateWorkspace,
}: WorkspacesSidebarProps) {
  const searchLower = searchQuery.toLowerCase();

  const filteredWorkspaces = workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(searchLower)
  );

  const filteredArchivedWorkspaces = archivedWorkspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(searchLower)
  );

  return (
    <div className="w-full h-full bg-secondary flex flex-col">
      <div className="flex flex-col gap-base">
        <SectionHeader
          title="Workspaces"
          icon={PlusIcon}
          onIconClick={onAddWorkspace}
        />
        <div className="px-base">
          <InputField
            variant="search"
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search..."
          />
        </div>
      </div>
      <div className="flex flex-col flex-1 overflow-y-auto">
        <CollapsibleSection
          persistKey={PERSIST_KEYS.workspacesSidebarActive}
          title="Active"
          defaultExpanded
          className="p-base"
          contentClassName="flex flex-col gap-base min-h-[50vh]"
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
              isArchived={false}
              hasPendingApproval={workspace.hasPendingApproval}
              hasRunningDevServer={workspace.hasRunningDevServer}
              latestProcessCompletedAt={workspace.latestProcessCompletedAt}
              latestProcessStatus={workspace.latestProcessStatus}
              onClick={() => onSelectWorkspace(workspace.id)}
              onDelete={
                onDeleteWorkspace
                  ? () => onDeleteWorkspace(workspace.taskId)
                  : undefined
              }
              onArchive={
                onArchiveWorkspace
                  ? () => onArchiveWorkspace(workspace.id, false)
                  : undefined
              }
              onPin={
                onPinWorkspace
                  ? () =>
                      onPinWorkspace(workspace.id, workspace.isPinned ?? false)
                  : undefined
              }
              onDuplicate={
                onDuplicateWorkspace
                  ? () => onDuplicateWorkspace(workspace.id)
                  : undefined
              }
            />
          ))}
        </CollapsibleSection>
        <CollapsibleSection
          persistKey={PERSIST_KEYS.workspacesSidebarArchived}
          title="Archived"
          defaultExpanded
          className="px-base pb-half"
        >
          {filteredArchivedWorkspaces.map((workspace) => (
            <WorkspaceSummary
              summary
              key={workspace.id}
              name={workspace.name}
              filesChanged={workspace.filesChanged}
              linesAdded={workspace.linesAdded}
              linesRemoved={workspace.linesRemoved}
              isActive={selectedWorkspaceId === workspace.id}
              isRunning={workspace.isRunning}
              isPinned={workspace.isPinned}
              isArchived={true}
              hasPendingApproval={workspace.hasPendingApproval}
              hasRunningDevServer={workspace.hasRunningDevServer}
              latestProcessCompletedAt={workspace.latestProcessCompletedAt}
              latestProcessStatus={workspace.latestProcessStatus}
              onClick={() => onSelectWorkspace(workspace.id)}
              onDelete={
                onDeleteWorkspace
                  ? () => onDeleteWorkspace(workspace.taskId)
                  : undefined
              }
              onArchive={
                onArchiveWorkspace
                  ? () => onArchiveWorkspace(workspace.id, true)
                  : undefined
              }
              onPin={
                onPinWorkspace
                  ? () =>
                      onPinWorkspace(workspace.id, workspace.isPinned ?? false)
                  : undefined
              }
              onDuplicate={
                onDuplicateWorkspace
                  ? () => onDuplicateWorkspace(workspace.id)
                  : undefined
              }
            />
          ))}
        </CollapsibleSection>
      </div>
    </div>
  );
}
