import { useState, useMemo, useCallback, useEffect } from 'react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useUserContext } from '@/contexts/remote/UserContext';
import { useScratch } from '@/hooks/useScratch';
import { useOrganizationProjects } from '@/hooks/useOrganizationProjects';
import { useOrganizationStore } from '@/stores/useOrganizationStore';
import { ScratchType, type DraftWorkspaceData } from 'shared/types';
import { splitMessageToTitleDescription } from '@/utils/string';
import {
  PERSIST_KEYS,
  usePersistedExpanded,
  useUiPreferencesStore,
} from '@/stores/useUiPreferencesStore';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import { WorkspaceSidebarFilters } from '@/components/ui-new/views/WorkspaceSidebarFilters';

export type WorkspaceLayoutMode = 'flat' | 'accordion';

// Fixed UUID for the universal workspace draft (same as in useCreateModeState.ts)
const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

const PAGE_SIZE = 50;

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

  // Workspace sidebar filters
  const workspaceFilters = useUiPreferencesStore((s) => s.workspaceFilters);
  const setWorkspaceProjectFilter = useUiPreferencesStore(
    (s) => s.setWorkspaceProjectFilter
  );
  const setWorkspacePrFilter = useUiPreferencesStore(
    (s) => s.setWorkspacePrFilter
  );
  const clearWorkspaceFilters = useUiPreferencesStore(
    (s) => s.clearWorkspaceFilters
  );

  // Remote data for project filter
  const { workspaces: remoteWorkspaces } = useUserContext();
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  const { data: remoteProjects = [] } = useOrganizationProjects(selectedOrgId);

  // Map local workspace ID → remote project ID
  const remoteProjectByLocalId = useMemo(() => {
    const map = new Map<string, string>();
    for (const rw of remoteWorkspaces) {
      if (rw.local_workspace_id) {
        map.set(rw.local_workspace_id, rw.project_id);
      }
    }
    return map;
  }, [remoteWorkspaces]);

  // Only show projects that have at least one linked workspace
  const projectsWithWorkspaces = useMemo(() => {
    const linkedProjectIds = new Set(remoteProjectByLocalId.values());
    return remoteProjects.filter((p) => linkedProjectIds.has(p.id));
  }, [remoteProjects, remoteProjectByLocalId]);

  const hasActiveFilters =
    workspaceFilters.projectIds.length > 0 ||
    workspaceFilters.prFilter !== 'all';

  // Pagination state for infinite scroll
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  // Reset display limit when search or filters change
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [searchQuery, showArchive, workspaceFilters]);

  const searchLower = searchQuery.toLowerCase();
  const isSearching = searchQuery.length > 0;

  // Apply sidebar filters (project + PR), then search
  const filteredActiveWorkspaces = useMemo(() => {
    let result = activeWorkspaces;

    // Project filter
    if (workspaceFilters.projectIds.length > 0) {
      result = result.filter((ws) => {
        const projectId = remoteProjectByLocalId.get(ws.id);
        return projectId && workspaceFilters.projectIds.includes(projectId);
      });
    }

    // PR filter
    if (workspaceFilters.prFilter === 'has_pr') {
      result = result.filter((ws) => !!ws.prStatus);
    } else if (workspaceFilters.prFilter === 'no_pr') {
      result = result.filter((ws) => !ws.prStatus);
    }

    // Search filter
    if (searchLower) {
      result = result.filter(
        (ws) =>
          ws.name.toLowerCase().includes(searchLower) ||
          ws.branch.toLowerCase().includes(searchLower)
      );
    }

    return result;
  }, [activeWorkspaces, workspaceFilters, remoteProjectByLocalId, searchLower]);

  const filteredArchivedWorkspaces = useMemo(() => {
    let result = archivedWorkspaces;

    if (workspaceFilters.projectIds.length > 0) {
      result = result.filter((ws) => {
        const projectId = remoteProjectByLocalId.get(ws.id);
        return projectId && workspaceFilters.projectIds.includes(projectId);
      });
    }

    if (workspaceFilters.prFilter === 'has_pr') {
      result = result.filter((ws) => !!ws.prStatus);
    } else if (workspaceFilters.prFilter === 'no_pr') {
      result = result.filter((ws) => !ws.prStatus);
    }

    if (searchLower) {
      result = result.filter(
        (ws) =>
          ws.name.toLowerCase().includes(searchLower) ||
          ws.branch.toLowerCase().includes(searchLower)
      );
    }

    return result;
  }, [
    archivedWorkspaces,
    workspaceFilters,
    remoteProjectByLocalId,
    searchLower,
  ]);

  // Apply pagination (only when not searching)
  const paginatedActiveWorkspaces = useMemo(
    () =>
      isSearching
        ? filteredActiveWorkspaces
        : filteredActiveWorkspaces.slice(0, displayLimit),
    [filteredActiveWorkspaces, displayLimit, isSearching]
  );

  const paginatedArchivedWorkspaces = useMemo(
    () =>
      isSearching
        ? filteredArchivedWorkspaces
        : filteredArchivedWorkspaces.slice(0, displayLimit),
    [filteredArchivedWorkspaces, displayLimit, isSearching]
  );

  // Check if there are more workspaces to load
  const hasMoreWorkspaces = showArchive
    ? filteredArchivedWorkspaces.length > displayLimit
    : filteredActiveWorkspaces.length > displayLimit;

  // Handle scroll to load more
  const handleLoadMore = useCallback(() => {
    if (!isSearching && hasMoreWorkspaces) {
      setDisplayLimit((prev) => prev + PAGE_SIZE);
    }
  }, [isSearching, hasMoreWorkspaces]);

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

  const filterElement = (
    <WorkspaceSidebarFilters
      projects={projectsWithWorkspaces}
      selectedProjectIds={workspaceFilters.projectIds}
      prFilter={workspaceFilters.prFilter}
      hasActiveFilters={hasActiveFilters}
      onProjectFilterChange={setWorkspaceProjectFilter}
      onPrFilterChange={setWorkspacePrFilter}
      onClearFilters={clearWorkspaceFilters}
    />
  );

  return (
    <WorkspacesSidebar
      workspaces={paginatedActiveWorkspaces}
      totalWorkspacesCount={activeWorkspaces.length}
      archivedWorkspaces={paginatedArchivedWorkspaces}
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
      onLoadMore={handleLoadMore}
      hasMoreWorkspaces={hasMoreWorkspaces && !isSearching}
      filterElement={filterElement}
    />
  );
}
