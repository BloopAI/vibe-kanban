import { PlusIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
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
  isCreateMode = false,
  draftTitle,
  onSelectCreate,
}: WorkspacesSidebarProps) {
  const { t } = useTranslation(['tasks', 'common']);
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
          title={t('common:workspaces.title')}
          icon={PlusIcon}
          onIconClick={onAddWorkspace}
        />
        <div className="px-base">
          <InputField
            variant="search"
            value={searchQuery}
            onChange={onSearchChange}
            placeholder={t('common:workspaces.searchPlaceholder')}
          />
        </div>
      </div>
      <div className="flex flex-col flex-1 overflow-y-auto">
        <CollapsibleSection
          persistKey={PERSIST_KEYS.workspacesSidebarActive}
          title={t('common:workspaces.active')}
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
              workspaceId={workspace.id}
              filesChanged={workspace.filesChanged}
              linesAdded={workspace.linesAdded}
              linesRemoved={workspace.linesRemoved}
              isActive={selectedWorkspaceId === workspace.id}
              isRunning={workspace.isRunning}
              isPinned={workspace.isPinned}
              hasPendingApproval={workspace.hasPendingApproval}
              hasRunningDevServer={workspace.hasRunningDevServer}
              hasUnseenActivity={workspace.hasUnseenActivity}
              latestProcessCompletedAt={workspace.latestProcessCompletedAt}
              latestProcessStatus={workspace.latestProcessStatus}
              prStatus={workspace.prStatus}
              onClick={() => onSelectWorkspace(workspace.id)}
            />
          ))}
        </CollapsibleSection>
        <CollapsibleSection
          persistKey={PERSIST_KEYS.workspacesSidebarArchived}
          title={t('common:workspaces.archived')}
          defaultExpanded
          className="px-base pb-half"
        >
          {filteredArchivedWorkspaces.map((workspace) => (
            <WorkspaceSummary
              summary
              key={workspace.id}
              name={workspace.name}
              workspaceId={workspace.id}
              filesChanged={workspace.filesChanged}
              linesAdded={workspace.linesAdded}
              linesRemoved={workspace.linesRemoved}
              isActive={selectedWorkspaceId === workspace.id}
              isRunning={workspace.isRunning}
              isPinned={workspace.isPinned}
              hasPendingApproval={workspace.hasPendingApproval}
              hasRunningDevServer={workspace.hasRunningDevServer}
              hasUnseenActivity={workspace.hasUnseenActivity}
              latestProcessCompletedAt={workspace.latestProcessCompletedAt}
              latestProcessStatus={workspace.latestProcessStatus}
              prStatus={workspace.prStatus}
              onClick={() => onSelectWorkspace(workspace.id)}
            />
          ))}
        </CollapsibleSection>
      </div>
    </div>
  );
}
