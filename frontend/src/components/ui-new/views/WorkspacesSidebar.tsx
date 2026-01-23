import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  PlusIcon,
  ArrowLeftIcon,
  ArchiveIcon,
  StackIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { WorkspaceSummary } from '@/components/ui-new/primitives/WorkspaceSummary';
import {
  CollapsibleSectionHeader,
  type SectionAction,
} from '../primitives/CollapsibleSectionHeader';
import { PERSIST_KEYS } from '@/stores/useUiPreferencesStore';
import type { WorkspaceLayoutMode } from '../containers/WorkspacesSidebarContainer';

const PAGE_SIZE = 50;

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
  /** Layout mode for active workspaces */
  layoutMode?: WorkspaceLayoutMode;
  /** Handler for toggling layout mode */
  onToggleLayoutMode?: () => void;
}

function WorkspaceList({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
}: {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
}) {
  return (
    <>
      {workspaces.map((workspace) => (
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
    </>
  );
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
  layoutMode = 'flat',
  onToggleLayoutMode,
}: WorkspacesSidebarProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const searchLower = searchQuery.toLowerCase();
  const isSearching = searchQuery.length > 0;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  // Reset display limit when search changes or archive view changes
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [searchQuery, showArchive]);

  // All filtered workspaces (before pagination)
  const allFilteredWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          workspace.name.toLowerCase().includes(searchLower) ||
          workspace.branch.toLowerCase().includes(searchLower)
      ),
    [workspaces, searchLower]
  );

  const allFilteredArchivedWorkspaces = useMemo(
    () =>
      archivedWorkspaces.filter(
        (workspace) =>
          workspace.name.toLowerCase().includes(searchLower) ||
          workspace.branch.toLowerCase().includes(searchLower)
      ),
    [archivedWorkspaces, searchLower]
  );

  // Paginated workspaces for display
  const filteredWorkspaces = useMemo(
    () =>
      isSearching
        ? allFilteredWorkspaces
        : allFilteredWorkspaces.slice(0, displayLimit),
    [allFilteredWorkspaces, displayLimit, isSearching]
  );

  const filteredArchivedWorkspaces = useMemo(
    () =>
      isSearching
        ? allFilteredArchivedWorkspaces
        : allFilteredArchivedWorkspaces.slice(0, displayLimit),
    [allFilteredArchivedWorkspaces, displayLimit, isSearching]
  );

  // Check if there are more workspaces to load
  const hasMoreWorkspaces = showArchive
    ? allFilteredArchivedWorkspaces.length > displayLimit
    : allFilteredWorkspaces.length > displayLimit;

  // Handle scroll to load more
  const handleScroll = useCallback(() => {
    if (isSearching || !hasMoreWorkspaces) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Load more when scrolled within 100px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      setDisplayLimit((prev) => prev + PAGE_SIZE);
    }
  }, [isSearching, hasMoreWorkspaces]);

  // Categorize workspaces for accordion layout
  const { raisedHandWorkspaces, idleWorkspaces, runningWorkspaces } =
    useMemo(() => {
      return {
        raisedHandWorkspaces: filteredWorkspaces.filter(
          (ws) => ws.hasPendingApproval
        ),
        idleWorkspaces: filteredWorkspaces.filter(
          (ws) => !ws.isRunning && !ws.hasPendingApproval
        ),
        runningWorkspaces: filteredWorkspaces.filter(
          (ws) => ws.isRunning && !ws.hasPendingApproval
        ),
      };
    }, [filteredWorkspaces]);

  const headerActions: SectionAction[] = [
    {
      icon: StackIcon,
      onClick: () => onToggleLayoutMode?.(),
      isActive: layoutMode === 'accordion',
    },
    {
      icon: PlusIcon,
      onClick: () => onAddWorkspace?.(),
    },
  ];

  return (
    <div className="w-full h-full bg-secondary flex flex-col">
      {/* Header + Search */}
      <div className="flex flex-col gap-base">
        <CollapsibleSectionHeader
          title={t('common:workspaces.title')}
          collapsible={false}
          actions={headerActions}
          className="border-b"
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
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-base"
      >
        {showArchive ? (
          /* Archived workspaces view */
          <div className="flex flex-col gap-base">
            <span className="text-sm font-medium text-low px-base">
              {t('common:workspaces.archived')}
            </span>
            {filteredArchivedWorkspaces.length === 0 ? (
              <span className="text-sm text-low opacity-60 px-base">
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
        ) : layoutMode === 'accordion' ? (
          /* Accordion layout view */
          <div className="flex flex-col gap-base">
            {/* Needs Attention section */}
            <CollapsibleSectionHeader
              title={t('common:workspaces.needsAttention')}
              persistKey={PERSIST_KEYS.workspacesSidebarRaisedHand}
              defaultExpanded={true}
            >
              <div className="flex flex-col gap-base py-half">
                {draftTitle && (
                  <WorkspaceSummary
                    name={draftTitle}
                    isActive={isCreateMode}
                    isDraft={true}
                    onClick={onSelectCreate}
                  />
                )}
                {raisedHandWorkspaces.length === 0 && !draftTitle ? (
                  <span className="text-sm text-low opacity-60 pl-base">
                    {t('common:workspaces.noWorkspaces')}
                  </span>
                ) : (
                  <WorkspaceList
                    workspaces={raisedHandWorkspaces}
                    selectedWorkspaceId={selectedWorkspaceId}
                    onSelectWorkspace={onSelectWorkspace}
                  />
                )}
              </div>
            </CollapsibleSectionHeader>

            {/* Idle section */}
            <CollapsibleSectionHeader
              title={t('common:workspaces.idle')}
              persistKey={PERSIST_KEYS.workspacesSidebarNotRunning}
              defaultExpanded={true}
            >
              <div className="flex flex-col gap-base py-half">
                {idleWorkspaces.length === 0 ? (
                  <span className="text-sm text-low opacity-60 pl-base">
                    {t('common:workspaces.noWorkspaces')}
                  </span>
                ) : (
                  <WorkspaceList
                    workspaces={idleWorkspaces}
                    selectedWorkspaceId={selectedWorkspaceId}
                    onSelectWorkspace={onSelectWorkspace}
                  />
                )}
              </div>
            </CollapsibleSectionHeader>

            {/* Running section */}
            <CollapsibleSectionHeader
              title={t('common:workspaces.running')}
              persistKey={PERSIST_KEYS.workspacesSidebarRunning}
              defaultExpanded={true}
            >
              <div className="flex flex-col gap-base py-half">
                {runningWorkspaces.length === 0 ? (
                  <span className="text-sm text-low opacity-60 pl-base">
                    {t('common:workspaces.noWorkspaces')}
                  </span>
                ) : (
                  <WorkspaceList
                    workspaces={runningWorkspaces}
                    selectedWorkspaceId={selectedWorkspaceId}
                    onSelectWorkspace={onSelectWorkspace}
                  />
                )}
              </div>
            </CollapsibleSectionHeader>
          </div>
        ) : (
          /* Active workspaces flat view */
          <div className="flex flex-col gap-base">
            <div className="flex items-center justify-between px-base">
              <span className="text-sm font-medium text-low">
                {t('common:workspaces.active')}
              </span>
              <span className="text-xs text-low">{workspaces.length}</span>
            </div>
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
