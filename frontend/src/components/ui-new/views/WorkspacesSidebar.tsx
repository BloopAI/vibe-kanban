import { PlusIcon, ArrowLeftIcon, ArchiveIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';
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
  /** Whether we're in create mode */
  isCreateMode?: boolean;
  /** Title extracted from draft message (only shown when isCreateMode and non-empty) */
  draftTitle?: string;
  /** Handler to navigate back to create mode */
  onSelectCreate?: () => void;
  /** Whether to show archived workspaces */
  showArchive?: boolean;
  /** Handler for toggling archive view */
  onShowArchiveChange?: (show: boolean) => void;
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
  showArchive = false,
  onShowArchiveChange,
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
      {/* Header + Search */}
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

      {/* Scrollable workspace list */}
      <div className="flex-1 overflow-y-auto p-base">
        {showArchive ? (
          /* Archived workspaces view */
          <div className="flex flex-col gap-base">
            <span className="text-sm font-medium text-low">
              {t('common:workspaces.archived')}
            </span>
            {filteredArchivedWorkspaces.length === 0 ? (
              <span className="text-sm text-low opacity-60">
                {t('common:workspaces.noArchived')}
              </span>
            ) : (
              filteredArchivedWorkspaces.map((workspace) => (
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
              ))
            )}
          </div>
        ) : (
          /* Active workspaces view */
          <div className="flex flex-col gap-base">
            <span className="text-sm font-medium text-low">
              {t('common:workspaces.active')}
            </span>
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
          </div>
        )}
      </div>

      {/* Fixed footer toggle - only show if there are archived workspaces */}
      <div className="border-t border-primary p-base">
        <button
          onClick={() => onShowArchiveChange?.(!showArchive)}
          className="w-full flex items-center gap-base text-sm text-low hover:text-normal transition-colors duration-100"
        >
          {showArchive ? (
            <>
              <ArrowLeftIcon className="size-icon-xs" />
              <span>{t('common:workspaces.backToActive')}</span>
            </>
          ) : (
            <>
              <ArchiveIcon className="size-icon-xs" />
              <span>{t('common:workspaces.viewArchive')}</span>
              <span className="ml-auto text-xs bg-tertiary px-1.5 py-0.5 rounded">
                {archivedWorkspaces.length}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
