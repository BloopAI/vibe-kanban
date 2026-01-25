import { useState, useMemo, useCallback } from 'react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useScratch } from '@/hooks/useScratch';
import { ScratchType, type DraftWorkspaceData } from 'shared/types';
import { splitMessageToTitleDescription } from '@/utils/string';
import {
  PERSIST_KEYS,
  usePersistedExpanded,
} from '@/stores/useUiPreferencesStore';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';

export type WorkspaceLayoutMode = 'flat' | 'accordion';

// Fixed UUID for the universal workspace draft (same as in useCreateModeState.ts)
const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

interface WorkspacesSidebarContainerProps {
  onScrollToBottom: () => void;
}

export function WorkspacesSidebarContainer({
  onScrollToBottom,
}: WorkspacesSidebarContainerProps) {
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
  const [isAccordionLayout, setAccordionLayout] = usePersistedExpanded(
    PERSIST_KEYS.workspacesSidebarAccordionLayout,
    false
  );

  const layoutMode: WorkspaceLayoutMode = isAccordionLayout
    ? 'accordion'
    : 'flat';
  const toggleLayoutMode = () => setAccordionLayout(!isAccordionLayout);

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

  // Handle workspace selection - scroll to bottom if re-selecting same workspace
  const handleSelectWorkspace = useCallback(
    (id: string) => {
      if (id === selectedWorkspaceId) {
        onScrollToBottom();
      } else {
        selectWorkspace(id);
      }
    },
    [selectedWorkspaceId, selectWorkspace, onScrollToBottom]
  );

  return (
    <WorkspacesSidebar
      workspaces={activeWorkspaces}
      archivedWorkspaces={archivedWorkspaces}
      selectedWorkspaceId={selectedWorkspaceId ?? null}
      onSelectWorkspace={handleSelectWorkspace}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddWorkspace={navigateToCreate}
      isCreateMode={isCreateMode}
      draftTitle={persistedDraftTitle}
      onSelectCreate={navigateToCreate}
      showArchive={showArchive}
      onShowArchiveChange={setShowArchive}
      layoutMode={layoutMode}
      onToggleLayoutMode={toggleLayoutMode}
    />
  );
}
