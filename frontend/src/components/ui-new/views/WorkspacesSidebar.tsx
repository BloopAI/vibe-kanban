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
  onDeleteWorkspace?: (workspaceId: string) => void;
  onArchiveWorkspace?: (workspaceId: string, isArchived: boolean) => void;
  onPinWorkspace?: (workspaceId: string, isPinned: boolean) => void;
  onDuplicateWorkspace?: (workspaceId: string) => void;
  /** Whether we're in create mode */
  isCreateMode?: boolean;
  /** Title extracted from draft message (only shown when isCreateMode and non-empty) */
  draftTitle?: string;
  /** Handler to navigate back to create mode */
  onSelectCreate?: () => void;
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
  isCreateMode = false,
  draftTitle,
  onSelectCreate,
}: WorkspacesSidebarProps) {
  const searchLower = searchQuery.toLowerCase();
  const isSearching = searchQuery.length > 0;
  const DISPLAY_LIMIT = 10;

  const filteredWorkspaces = workspaces
    .filter((workspace) => workspace.name.toLowerCase().includes(searchLower))
    .slice(0, isSearching ? undefined : DISPLAY_LIMIT);

  const filteredArchivedWorkspaces = archivedWorkspaces
    .filter((workspace) => workspace.name.toLowerCase().includes(searchLower))
    .slice(0, isSearching ? undefined : DISPLAY_LIMIT);

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
          {draftTitle && (
            <WorkspaceSummary
              name={draftTitle}
              isActive={isCreateMode}
              isDraft={true}
              onClick={onSelectCreate}
            />
          )}
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
                  ? () => onDeleteWorkspace(workspace.id)
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
                  ? () => onDeleteWorkspace(workspace.id)
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
