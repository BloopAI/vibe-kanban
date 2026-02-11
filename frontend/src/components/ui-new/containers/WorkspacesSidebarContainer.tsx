import { useState, useMemo, useCallback, useEffect } from 'react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useUserContext } from '@/contexts/remote/UserContext';
import { useScratch } from '@/hooks/useScratch';
import { useAllOrganizationProjects } from '@/hooks/useAllOrganizationProjects';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { ScratchType, type DraftWorkspaceData } from 'shared/types';
import type { Project } from 'shared/remote-types';
import { splitMessageToTitleDescription } from '@/utils/string';
import {
  PERSIST_KEYS,
  usePersistedExpanded,
  useUiPreferencesStore,
  type WorkspacePrFilter,
} from '@/stores/useUiPreferencesStore';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import { MultiSelectDropdown } from '@/components/ui-new/primitives/MultiSelectDropdown';
import { PropertyDropdown } from '@/components/ui-new/primitives/PropertyDropdown';
import { FolderIcon, GitPullRequestIcon } from '@phosphor-icons/react';

export type WorkspaceLayoutMode = 'flat' | 'accordion';

// Fixed UUID for the universal workspace draft (same as in useCreateModeState.ts)
const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

const PAGE_SIZE = 50;
const NO_PROJECT_ID = '__no_project__';

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
  // Remote data for project filter (all orgs)
  const { workspaces: remoteWorkspaces } = useUserContext();
  const { data: allRemoteProjects } = useAllOrganizationProjects();
  const { data: orgsData } = useUserOrganizations();
  const organizations = useMemo(
    () => orgsData?.organizations ?? [],
    [orgsData?.organizations]
  );

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

  // Build org name lookup
  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of organizations) {
      map.set(org.id, org.name);
    }
    return map;
  }, [organizations]);

  // Group projects by org, only including projects with linked workspaces
  const projectGroups = useMemo(() => {
    const linkedProjectIds = new Set(remoteProjectByLocalId.values());
    const relevant = allRemoteProjects.filter((p) =>
      linkedProjectIds.has(p.id)
    );

    const groupMap = new Map<string, Project[]>();
    for (const project of relevant) {
      const arr = groupMap.get(project.organization_id) ?? [];
      arr.push(project);
      groupMap.set(project.organization_id, arr);
    }

    return Array.from(groupMap.entries())
      .map(([orgId, projects]) => ({
        orgId,
        orgName: orgNameById.get(orgId) ?? 'Unknown',
        projects: projects.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.orgName.localeCompare(b.orgName));
  }, [allRemoteProjects, remoteProjectByLocalId, orgNameById]);

  // Build flat project options for MultiSelectDropdown
  const projectOptions = useMemo(
    () => [
      { value: NO_PROJECT_ID, label: 'No project' },
      ...projectGroups.flatMap((g) =>
        g.projects.map((p) => ({
          value: p.id,
          label: p.name,
          renderOption: () => (
            <div className="flex items-center gap-base">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: `hsl(${p.color})` }}
              />
              {p.name}
            </div>
          ),
        }))
      ),
    ],
    [projectGroups]
  );

  const PR_FILTER_OPTIONS: {
    value: WorkspacePrFilter;
    label: string;
  }[] = [
    { value: 'all', label: 'All' },
    { value: 'has_pr', label: 'Has PR' },
    { value: 'no_pr', label: 'No PR' },
  ];

  // Pagination state for infinite scroll
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  // Reset display limit when search or filters change
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [searchQuery, showArchive, workspaceFilters]);

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchLower = searchQuery.toLowerCase();
  const isSearching = searchQuery.length > 0;
  const compactFilters = isSearching || isSearchFocused;

  // Apply sidebar filters (project + PR), then search
  const filteredActiveWorkspaces = useMemo(() => {
    let result = activeWorkspaces;

    // Project filter
    if (workspaceFilters.projectIds.length > 0) {
      const includeNoProject =
        workspaceFilters.projectIds.includes(NO_PROJECT_ID);
      const realProjectIds = workspaceFilters.projectIds.filter(
        (id) => id !== NO_PROJECT_ID
      );
      result = result.filter((ws) => {
        const projectId = remoteProjectByLocalId.get(ws.id);
        if (!projectId) return includeNoProject;
        return realProjectIds.includes(projectId);
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
      const includeNoProject =
        workspaceFilters.projectIds.includes(NO_PROJECT_ID);
      const realProjectIds = workspaceFilters.projectIds.filter(
        (id) => id !== NO_PROJECT_ID
      );
      result = result.filter((ws) => {
        const projectId = remoteProjectByLocalId.get(ws.id);
        if (!projectId) return includeNoProject;
        return realProjectIds.includes(projectId);
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

  const filterBar = (
    <div className="flex items-stretch gap-half shrink-0">
      <MultiSelectDropdown
        values={workspaceFilters.projectIds}
        options={projectOptions}
        onChange={setWorkspaceProjectFilter}
        icon={FolderIcon}
        label="Project"
        iconOnly={compactFilters}
      />
      <PropertyDropdown
        value={workspaceFilters.prFilter}
        options={PR_FILTER_OPTIONS}
        onChange={setWorkspacePrFilter}
        icon={GitPullRequestIcon}
        label="PR"
        iconOnly={compactFilters}
      />
    </div>
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
      filterBar={filterBar}
      onSearchFocusChange={setIsSearchFocused}
    />
  );
}
