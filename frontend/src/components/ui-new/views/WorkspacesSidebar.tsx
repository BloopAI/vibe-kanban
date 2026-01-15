import { useState, useCallback, useMemo } from 'react';
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
  /** Handler for reordering a workspace */
  onReorderWorkspace?: (workspaceId: string, newSortOrder: number) => void;
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

// Calculate new sort order using fractional indexing
function calculateNewSortOrder(
  items: Workspace[],
  activeId: string,
  overId: string
): number {
  const oldIndex = items.findIndex((item) => item.id === activeId);
  const newIndex = items.findIndex((item) => item.id === overId);

  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return items[oldIndex]?.sortOrder ?? 0;
  }

  const movingUp = newIndex < oldIndex;

  if (newIndex === 0) {
    // Moving to top: use value less than first item
    return items[0].sortOrder - 1;
  } else if (newIndex === items.length - 1) {
    // Moving to bottom: use value greater than last item
    return items[items.length - 1].sortOrder + 1;
  } else {
    // Moving to middle: use midpoint between neighbors
    const prevIndex = movingUp ? newIndex - 1 : newIndex;
    const nextIndex = movingUp ? newIndex : newIndex + 1;
    return (items[prevIndex].sortOrder + items[nextIndex].sortOrder) / 2;
  }
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
  onReorderWorkspace,
}: WorkspacesSidebarProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const searchLower = searchQuery.toLowerCase();
  const isSearching = searchQuery.length > 0;
  const DISPLAY_LIMIT = 10;

  // Track optimistic updates locally for smooth drag experience
  const [optimisticOrder, setOptimisticOrder] = useState<{
    id: string;
    sortOrder: number;
  } | null>(null);

  // Apply optimistic update to workspaces
  const workspacesWithOptimistic = useMemo(() => {
    if (!optimisticOrder) return workspaces;
    return workspaces
      .map((ws) =>
        ws.id === optimisticOrder.id
          ? { ...ws, sortOrder: optimisticOrder.sortOrder }
          : ws
      )
      .sort((a, b) => {
        // First sort by pinned
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        // Then by sortOrder
        return a.sortOrder - b.sortOrder;
      });
  }, [workspaces, optimisticOrder]);

  // Apply optimistic update to archived workspaces
  const archivedWorkspacesWithOptimistic = useMemo(() => {
    if (!optimisticOrder) return archivedWorkspaces;
    return archivedWorkspaces
      .map((ws) =>
        ws.id === optimisticOrder.id
          ? { ...ws, sortOrder: optimisticOrder.sortOrder }
          : ws
      )
      .sort((a, b) => {
        // First sort by pinned
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        // Then by sortOrder
        return a.sortOrder - b.sortOrder;
      });
  }, [archivedWorkspaces, optimisticOrder]);

  // Split workspaces into pinned and unpinned for drag-drop restrictions
  const pinnedWorkspaces = useMemo(
    () => workspacesWithOptimistic.filter((ws) => ws.isPinned),
    [workspacesWithOptimistic]
  );
  const unpinnedWorkspaces = useMemo(
    () => workspacesWithOptimistic.filter((ws) => !ws.isPinned),
    [workspacesWithOptimistic]
  );
  const pinnedArchivedWorkspaces = useMemo(
    () => archivedWorkspacesWithOptimistic.filter((ws) => ws.isPinned),
    [archivedWorkspacesWithOptimistic]
  );
  const unpinnedArchivedWorkspaces = useMemo(
    () => archivedWorkspacesWithOptimistic.filter((ws) => !ws.isPinned),
    [archivedWorkspacesWithOptimistic]
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

  // Handle drag end for pinned workspaces
  const handlePinnedDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onReorderWorkspace) return;

      const items = showArchive ? pinnedArchivedWorkspaces : pinnedWorkspaces;
      const newSortOrder = calculateNewSortOrder(
        items,
        active.id as string,
        over.id as string
      );

      // Apply optimistic update
      setOptimisticOrder({ id: active.id as string, sortOrder: newSortOrder });

      // Persist to server
      onReorderWorkspace(active.id as string, newSortOrder);

      // Clear optimistic update after a delay (let server sync take over)
      setTimeout(() => setOptimisticOrder(null), 500);
    },
    [
      showArchive,
      pinnedWorkspaces,
      pinnedArchivedWorkspaces,
      onReorderWorkspace,
    ]
  );

  // Handle drag end for unpinned workspaces
  const handleUnpinnedDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onReorderWorkspace) return;

      const items = showArchive
        ? unpinnedArchivedWorkspaces
        : unpinnedWorkspaces;
      const newSortOrder = calculateNewSortOrder(
        items,
        active.id as string,
        over.id as string
      );

      // Apply optimistic update
      setOptimisticOrder({ id: active.id as string, sortOrder: newSortOrder });

      // Persist to server
      onReorderWorkspace(active.id as string, newSortOrder);

      // Clear optimistic update after a delay (let server sync take over)
      setTimeout(() => setOptimisticOrder(null), 500);
    },
    [
      showArchive,
      unpinnedWorkspaces,
      unpinnedArchivedWorkspaces,
      onReorderWorkspace,
    ]
  );

  // Disable drag-drop during search
  const isDragDisabled = isSearching || !onReorderWorkspace;

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
                    onDragEnd={handlePinnedDragEnd}
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
                    onDragEnd={handleUnpinnedDragEnd}
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
                onDragEnd={handlePinnedDragEnd}
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
                onDragEnd={handleUnpinnedDragEnd}
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
