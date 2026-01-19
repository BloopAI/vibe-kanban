import { useMemo } from 'react';
import { PlusIcon, ArrowLeftIcon, ArchiveIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  /** Handler for drag end on pinned workspaces */
  onPinnedDragEnd?: (event: DragEndEvent) => void;
  /** Handler for drag end on unpinned workspaces */
  onUnpinnedDragEnd?: (event: DragEndEvent) => void;
}

// Props for the sortable workspace item
interface SortableWorkspaceItemProps {
  workspace: Workspace;
  isActive: boolean;
  onClick: () => void;
}

// Sortable wrapper component for WorkspaceSummary
function SortableWorkspaceItem({
  workspace,
  isActive,
  onClick,
}: SortableWorkspaceItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workspace.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <WorkspaceSummary
        name={workspace.name}
        workspaceId={workspace.id}
        filesChanged={workspace.filesChanged}
        linesAdded={workspace.linesAdded}
        linesRemoved={workspace.linesRemoved}
        isActive={isActive}
        isRunning={workspace.isRunning}
        isPinned={workspace.isPinned}
        hasPendingApproval={workspace.hasPendingApproval}
        hasRunningDevServer={workspace.hasRunningDevServer}
        hasUnseenActivity={workspace.hasUnseenActivity}
        latestProcessCompletedAt={workspace.latestProcessCompletedAt}
        latestProcessStatus={workspace.latestProcessStatus}
        prStatus={workspace.prStatus}
        onClick={onClick}
      />
    </div>
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
  onPinnedDragEnd,
  onUnpinnedDragEnd,
}: WorkspacesSidebarProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const searchLower = searchQuery.toLowerCase();
  const isSearching = searchQuery.length > 0;
  const DISPLAY_LIMIT = 10;

  // Split workspaces into pinned and unpinned for drag-drop restrictions
  const pinnedWorkspaces = useMemo(
    () => workspaces.filter((ws) => ws.isPinned),
    [workspaces]
  );
  const unpinnedWorkspaces = useMemo(
    () => workspaces.filter((ws) => !ws.isPinned),
    [workspaces]
  );
  const pinnedArchivedWorkspaces = useMemo(
    () => archivedWorkspaces.filter((ws) => ws.isPinned),
    [archivedWorkspaces]
  );
  const unpinnedArchivedWorkspaces = useMemo(
    () => archivedWorkspaces.filter((ws) => !ws.isPinned),
    [archivedWorkspaces]
  );

  const filteredPinnedWorkspaces = pinnedWorkspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(searchLower)
  );
  const filteredUnpinnedWorkspaces = unpinnedWorkspaces
    .filter((workspace) => workspace.name.toLowerCase().includes(searchLower))
    .slice(0, isSearching ? undefined : DISPLAY_LIMIT);

  const filteredPinnedArchivedWorkspaces = pinnedArchivedWorkspaces.filter(
    (workspace) => workspace.name.toLowerCase().includes(searchLower)
  );
  const filteredUnpinnedArchivedWorkspaces = unpinnedArchivedWorkspaces
    .filter((workspace) => workspace.name.toLowerCase().includes(searchLower))
    .slice(0, isSearching ? undefined : DISPLAY_LIMIT);

  // Sensors with activation constraint to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Disable drag-drop during search or when handlers not provided
  const isDragDisabled = isSearching || !onPinnedDragEnd || !onUnpinnedDragEnd;

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
            {filteredPinnedArchivedWorkspaces.length === 0 &&
            filteredUnpinnedArchivedWorkspaces.length === 0 ? (
              <span className="text-sm text-low opacity-60">
                {t('common:workspaces.noArchived')}
              </span>
            ) : (
              <>
                {/* Pinned archived workspaces */}
                {filteredPinnedArchivedWorkspaces.length > 0 && (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onPinnedDragEnd}
                  >
                    <SortableContext
                      items={filteredPinnedArchivedWorkspaces.map((w) => w.id)}
                      strategy={verticalListSortingStrategy}
                      disabled={isDragDisabled}
                    >
                      <div className="flex flex-col gap-base">
                        {filteredPinnedArchivedWorkspaces.map((workspace) => (
                          <SortableWorkspaceItem
                            key={workspace.id}
                            workspace={workspace}
                            isActive={selectedWorkspaceId === workspace.id}
                            onClick={() => onSelectWorkspace(workspace.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
                {/* Unpinned archived workspaces */}
                {filteredUnpinnedArchivedWorkspaces.length > 0 && (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onUnpinnedDragEnd}
                  >
                    <SortableContext
                      items={filteredUnpinnedArchivedWorkspaces.map(
                        (w) => w.id
                      )}
                      strategy={verticalListSortingStrategy}
                      disabled={isDragDisabled}
                    >
                      <div className="flex flex-col gap-base">
                        {filteredUnpinnedArchivedWorkspaces.map((workspace) => (
                          <SortableWorkspaceItem
                            key={workspace.id}
                            workspace={workspace}
                            isActive={selectedWorkspaceId === workspace.id}
                            onClick={() => onSelectWorkspace(workspace.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </>
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
            {/* Pinned workspaces */}
            {filteredPinnedWorkspaces.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onPinnedDragEnd}
              >
                <SortableContext
                  items={filteredPinnedWorkspaces.map((w) => w.id)}
                  strategy={verticalListSortingStrategy}
                  disabled={isDragDisabled}
                >
                  <div className="flex flex-col gap-base">
                    {filteredPinnedWorkspaces.map((workspace) => (
                      <SortableWorkspaceItem
                        key={workspace.id}
                        workspace={workspace}
                        isActive={selectedWorkspaceId === workspace.id}
                        onClick={() => onSelectWorkspace(workspace.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            {/* Unpinned workspaces */}
            {filteredUnpinnedWorkspaces.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onUnpinnedDragEnd}
              >
                <SortableContext
                  items={filteredUnpinnedWorkspaces.map((w) => w.id)}
                  strategy={verticalListSortingStrategy}
                  disabled={isDragDisabled}
                >
                  <div className="flex flex-col gap-base">
                    {filteredUnpinnedWorkspaces.map((workspace) => (
                      <SortableWorkspaceItem
                        key={workspace.id}
                        workspace={workspace}
                        isActive={selectedWorkspaceId === workspace.id}
                        onClick={() => onSelectWorkspace(workspace.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
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
