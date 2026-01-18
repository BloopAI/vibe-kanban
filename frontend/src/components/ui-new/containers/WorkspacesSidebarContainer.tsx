import { useState, useMemo, useCallback } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useScratch } from '@/hooks/useScratch';
import { ScratchType, type DraftWorkspaceData } from 'shared/types';
import { splitMessageToTitleDescription } from '@/utils/string';
import {
  PERSIST_KEYS,
  usePersistedExpanded,
} from '@/stores/useUiPreferencesStore';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import { attemptsApi } from '@/lib/api';
import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';

// Fixed UUID for the universal workspace draft (same as in useCreateModeState.ts)
const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

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

export function WorkspacesSidebarContainer() {
  const {
    workspaceId: selectedWorkspaceId,
    activeWorkspaces,
    archivedWorkspaces,
    isCreateMode,
    selectWorkspace,
    navigateToCreate,
  } = useWorkspaceContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [showArchive, setShowArchive] = usePersistedExpanded(
    PERSIST_KEYS.workspacesSidebarArchived,
    false
  );

  // Track optimistic updates locally for smooth drag experience
  const [optimisticOrder, setOptimisticOrder] = useState<{
    id: string;
    sortOrder: number;
  } | null>(null);

  // Read persisted draft for sidebar placeholder
  const { scratch: draftScratch } = useScratch(
    ScratchType.DRAFT_WORKSPACE,
    DRAFT_WORKSPACE_ID
  );

  // Extract draft title from persisted scratch
  const persistedDraftTitle = useMemo(() => {
    const scratchData: DraftWorkspaceData | undefined =
      draftScratch?.payload?.type === 'DRAFT_WORKSPACE'
        ? draftScratch.payload.data
        : undefined;

    if (!scratchData?.message?.trim()) return undefined;
    const { title } = splitMessageToTitleDescription(
      scratchData.message.trim()
    );
    return title || 'New Workspace';
  }, [draftScratch]);

  // Apply optimistic update to workspaces
  const workspacesWithOptimistic = useMemo(() => {
    if (!optimisticOrder) return activeWorkspaces;
    return activeWorkspaces
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
  }, [activeWorkspaces, optimisticOrder]);

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

  // Split workspaces into pinned and unpinned for drag calculations
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

  // Handle drag end for pinned workspaces
  const handlePinnedDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const items = showArchive ? pinnedArchivedWorkspaces : pinnedWorkspaces;
      const newSortOrder = calculateNewSortOrder(
        items,
        active.id as string,
        over.id as string
      );

      // Apply optimistic update
      setOptimisticOrder({ id: active.id as string, sortOrder: newSortOrder });

      // Persist to server
      attemptsApi
        .update(active.id as string, { sort_order: newSortOrder })
        .catch((err) => {
          console.error('Failed to update workspace sort order:', err);
        });

      // Clear optimistic update after a delay (let server sync take over)
      setTimeout(() => setOptimisticOrder(null), 500);
    },
    [showArchive, pinnedWorkspaces, pinnedArchivedWorkspaces]
  );

  // Handle drag end for unpinned workspaces
  const handleUnpinnedDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

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
      attemptsApi
        .update(active.id as string, { sort_order: newSortOrder })
        .catch((err) => {
          console.error('Failed to update workspace sort order:', err);
        });

      // Clear optimistic update after a delay (let server sync take over)
      setTimeout(() => setOptimisticOrder(null), 500);
    },
    [showArchive, unpinnedWorkspaces, unpinnedArchivedWorkspaces]
  );

  return (
    <WorkspacesSidebar
      workspaces={workspacesWithOptimistic}
      archivedWorkspaces={archivedWorkspacesWithOptimistic}
      selectedWorkspaceId={selectedWorkspaceId ?? null}
      onSelectWorkspace={selectWorkspace}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddWorkspace={navigateToCreate}
      isCreateMode={isCreateMode}
      draftTitle={persistedDraftTitle}
      onSelectCreate={navigateToCreate}
      showArchive={showArchive}
      onShowArchiveChange={setShowArchive}
      onPinnedDragEnd={handlePinnedDragEnd}
      onUnpinnedDragEnd={handleUnpinnedDragEnd}
    />
  );
}
