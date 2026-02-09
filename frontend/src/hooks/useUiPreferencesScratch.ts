import { useCallback, useEffect, useRef } from 'react';
import { useScratch } from './useScratch';
import { useDebouncedCallback } from './useDebouncedCallback';
import {
  ScratchType,
  type UiPreferencesData,
  type ScratchPayload,
  type WorkspacePanelStateData,
  type JsonValue,
} from 'shared/types';
import {
  useUiPreferencesStore,
  DEFAULT_KANBAN_SHOW_WORKSPACES,
  DEFAULT_KANBAN_FILTER_STATE,
  KANBAN_PROJECT_VIEW_IDS,
  getDefaultShowSubIssuesForView,
  type RightMainPanelMode,
  type ContextBarPosition,
  type WorkspacePanelState,
  type KanbanSortField,
  type KanbanProjectViewsState,
} from '@/stores/useUiPreferencesStore';
import type { RepoAction } from '@/components/ui-new/primitives/RepoCard';
import type { IssuePriority } from 'shared/remote-types';

// Stable UUID for global UI preferences (not tied to a workspace/user)
// This is a deterministic UUID v5 generated from the namespace "ui-preferences"
// Using a fixed UUID ensures all users/sessions share the same preferences record
const UI_PREFERENCES_ID = '00000000-0000-0000-0000-000000000001';

const KANBAN_SORT_FIELDS: KanbanSortField[] = [
  'sort_order',
  'priority',
  'created_at',
  'updated_at',
  'title',
];

const isKanbanSortField = (value: string): value is KanbanSortField =>
  KANBAN_SORT_FIELDS.includes(value as KanbanSortField);

const isSortDirection = (value: string): value is 'asc' | 'desc' =>
  value === 'asc' || value === 'desc';

/**
 * Converts store state to scratch data format (camelCase to snake_case)
 */
function storeToScratchData(state: {
  repoActions: Record<string, RepoAction>;
  expanded: Record<string, boolean>;
  contextBarPosition: ContextBarPosition;
  paneSizes: Record<string, number | string>;
  collapsedPaths: Record<string, string[]>;
  fileSearchRepoId: string | null;
  isLeftSidebarVisible: boolean;
  isRightSidebarVisible: boolean;
  isTerminalVisible: boolean;
  workspacePanelStates: Record<string, WorkspacePanelState>;
  kanbanProjectViewsByProject: Record<string, KanbanProjectViewsState>;
}): UiPreferencesData {
  const workspacePanelStates: { [key: string]: WorkspacePanelStateData } = {};
  for (const [key, value] of Object.entries(state.workspacePanelStates)) {
    workspacePanelStates[key] = {
      right_main_panel_mode: value.rightMainPanelMode,
      is_left_main_panel_visible: value.isLeftMainPanelVisible,
    };
  }

  const kanbanProjectViewsByProject: UiPreferencesData['kanban_project_views_by_project'] =
    {};
  for (const [projectId, viewState] of Object.entries(
    state.kanbanProjectViewsByProject
  )) {
    kanbanProjectViewsByProject[projectId] = {
      active_view_id: viewState.activeViewId,
      views: viewState.views.map((view) => ({
        id: view.id,
        name: view.name,
        filters: {
          search_query: view.filters.searchQuery,
          priorities: [...view.filters.priorities],
          assignee_ids: [...view.filters.assigneeIds],
          tag_ids: [...view.filters.tagIds],
          sort_field: view.filters.sortField,
          sort_direction: view.filters.sortDirection,
        },
        show_sub_issues: view.showSubIssues,
        show_workspaces: view.showWorkspaces,
      })),
      draft: {
        filters: {
          search_query: viewState.draft.filters.searchQuery,
          priorities: [...viewState.draft.filters.priorities],
          assignee_ids: [...viewState.draft.filters.assigneeIds],
          tag_ids: [...viewState.draft.filters.tagIds],
          sort_field: viewState.draft.filters.sortField,
          sort_direction: viewState.draft.filters.sortDirection,
        },
        show_sub_issues: viewState.draft.showSubIssues,
        show_workspaces: viewState.draft.showWorkspaces,
      },
    };
  }

  return {
    repo_actions: state.repoActions as { [key: string]: string },
    expanded: state.expanded,
    context_bar_position: state.contextBarPosition,
    pane_sizes: state.paneSizes as { [key: string]: JsonValue },
    collapsed_paths: state.collapsedPaths,
    file_search_repo_id: state.fileSearchRepoId,
    is_left_sidebar_visible: state.isLeftSidebarVisible,
    is_right_sidebar_visible: state.isRightSidebarVisible,
    is_terminal_visible: state.isTerminalVisible,
    workspace_panel_states: workspacePanelStates,
    kanban_project_views_by_project: kanbanProjectViewsByProject,
  };
}

/**
 * Converts scratch data to store state format (snake_case to camelCase)
 */
function scratchDataToStore(data: UiPreferencesData): {
  repoActions: Record<string, RepoAction>;
  expanded: Record<string, boolean>;
  contextBarPosition: ContextBarPosition;
  paneSizes: Record<string, number | string>;
  collapsedPaths: Record<string, string[]>;
  fileSearchRepoId: string | null;
  isLeftSidebarVisible: boolean;
  isRightSidebarVisible: boolean;
  isTerminalVisible: boolean;
  workspacePanelStates: Record<string, WorkspacePanelState>;
  kanbanProjectViewsByProject: Record<string, KanbanProjectViewsState>;
} {
  const workspacePanelStates: Record<string, WorkspacePanelState> = {};
  if (data.workspace_panel_states) {
    for (const [key, value] of Object.entries(data.workspace_panel_states)) {
      if (value) {
        workspacePanelStates[key] = {
          rightMainPanelMode:
            (value.right_main_panel_mode as RightMainPanelMode) ?? null,
          isLeftMainPanelVisible: value.is_left_main_panel_visible ?? true,
        };
      }
    }
  }

  // Backwards compatibility with older payloads that used
  // file_search_repo_by_project (project_id -> repo_id).
  const legacyFileSearchRepoByProject = (
    data as UiPreferencesData & {
      file_search_repo_by_project?: Record<string, string>;
    }
  ).file_search_repo_by_project;
  const legacyFileSearchRepoId =
    legacyFileSearchRepoByProject &&
    Object.values(legacyFileSearchRepoByProject)[0]
      ? Object.values(legacyFileSearchRepoByProject)[0]
      : null;

  const kanbanProjectViewsByProject: Record<string, KanbanProjectViewsState> =
    {};
  for (const [projectId, value] of Object.entries(
    data.kanban_project_views_by_project ?? {}
  )) {
    if (!value) {
      continue;
    }

    const views = (value.views ?? []).map((view) => {
      const filters = view.filters;
      const sortField =
        filters && isKanbanSortField(filters.sort_field)
          ? filters.sort_field
          : 'sort_order';
      const sortDirection =
        filters && isSortDirection(filters.sort_direction)
          ? filters.sort_direction
          : 'asc';
      const normalizedSortDirection =
        view.id === KANBAN_PROJECT_VIEW_IDS.PERSONAL &&
        sortField === 'priority' &&
        sortDirection === 'desc'
          ? 'asc'
          : sortDirection;

      return {
        id: view.id,
        name: view.name,
        filters: {
          searchQuery: filters?.search_query ?? '',
          priorities: (filters?.priorities ?? []) as IssuePriority[],
          assigneeIds: filters?.assignee_ids ?? [],
          tagIds: filters?.tag_ids ?? [],
          sortField,
          sortDirection: normalizedSortDirection,
        },
        showSubIssues:
          view.show_sub_issues ?? getDefaultShowSubIssuesForView(view.id),
        showWorkspaces: view.show_workspaces ?? DEFAULT_KANBAN_SHOW_WORKSPACES,
      };
    });

    if (!value.active_view_id || views.length === 0) {
      continue;
    }

    const activeView =
      views.find((view) => view.id === value.active_view_id) ?? views[0];
    const draftFilters = value.draft?.filters;
    const draftSortField =
      draftFilters && isKanbanSortField(draftFilters.sort_field)
        ? draftFilters.sort_field
        : (activeView?.filters.sortField ??
          DEFAULT_KANBAN_FILTER_STATE.sortField);
    const draftSortDirection =
      draftFilters && isSortDirection(draftFilters.sort_direction)
        ? draftFilters.sort_direction
        : (activeView?.filters.sortDirection ??
          DEFAULT_KANBAN_FILTER_STATE.sortDirection);

    kanbanProjectViewsByProject[projectId] = {
      activeViewId: value.active_view_id,
      views,
      draft: {
        filters: {
          searchQuery:
            draftFilters?.search_query ??
            activeView?.filters.searchQuery ??
            DEFAULT_KANBAN_FILTER_STATE.searchQuery,
          priorities:
            (draftFilters?.priorities as IssuePriority[] | undefined) ??
            activeView?.filters.priorities ??
            DEFAULT_KANBAN_FILTER_STATE.priorities,
          assigneeIds:
            draftFilters?.assignee_ids ??
            activeView?.filters.assigneeIds ??
            DEFAULT_KANBAN_FILTER_STATE.assigneeIds,
          tagIds:
            draftFilters?.tag_ids ??
            activeView?.filters.tagIds ??
            DEFAULT_KANBAN_FILTER_STATE.tagIds,
          sortField: draftSortField,
          sortDirection: draftSortDirection,
        },
        showSubIssues:
          value.draft?.show_sub_issues ??
          activeView?.showSubIssues ??
          getDefaultShowSubIssuesForView(value.active_view_id),
        showWorkspaces:
          value.draft?.show_workspaces ??
          activeView?.showWorkspaces ??
          DEFAULT_KANBAN_SHOW_WORKSPACES,
      },
    };
  }

  return {
    repoActions: (data.repo_actions ?? {}) as Record<string, RepoAction>,
    expanded: (data.expanded ?? {}) as Record<string, boolean>,
    contextBarPosition:
      (data.context_bar_position as ContextBarPosition) ?? 'middle-right',
    paneSizes: (data.pane_sizes ?? {}) as Record<string, number | string>,
    collapsedPaths: (data.collapsed_paths ?? {}) as Record<string, string[]>,
    fileSearchRepoId: data.file_search_repo_id ?? legacyFileSearchRepoId,
    isLeftSidebarVisible: data.is_left_sidebar_visible ?? true,
    isRightSidebarVisible: data.is_right_sidebar_visible ?? true,
    isTerminalVisible: data.is_terminal_visible ?? true,
    workspacePanelStates,
    kanbanProjectViewsByProject,
  };
}

/**
 * Hook that syncs UI preferences between Zustand store and server scratch storage.
 * Should be used once at the app root level.
 */
export function useUiPreferencesScratch() {
  const { scratch, updateScratch, isLoading, isConnected } = useScratch(
    ScratchType.UI_PREFERENCES,
    UI_PREFERENCES_ID
  );

  // Track whether we've initialized from server
  const hasInitializedRef = useRef(false);
  // Track whether we're currently applying server data to prevent save loops
  const isApplyingServerDataRef = useRef(false);

  // Get current store state
  const storeState = useUiPreferencesStore((state) => ({
    repoActions: state.repoActions,
    expanded: state.expanded,
    contextBarPosition: state.contextBarPosition,
    paneSizes: state.paneSizes,
    collapsedPaths: state.collapsedPaths,
    fileSearchRepoId: state.fileSearchRepoId,
    isLeftSidebarVisible: state.isLeftSidebarVisible,
    isRightSidebarVisible: state.isRightSidebarVisible,
    isTerminalVisible: state.isTerminalVisible,
    workspacePanelStates: state.workspacePanelStates,
    kanbanProjectViewsByProject: state.kanbanProjectViewsByProject,
  }));

  // Extract scratch data
  const payload = scratch?.payload as ScratchPayload | undefined;
  const scratchData: UiPreferencesData | undefined =
    payload?.type === 'UI_PREFERENCES' ? payload.data : undefined;

  // Save to server function
  const saveToServer = useCallback(async () => {
    if (isApplyingServerDataRef.current || !hasInitializedRef.current) {
      return;
    }

    const currentState = useUiPreferencesStore.getState();
    const data = storeToScratchData({
      repoActions: currentState.repoActions,
      expanded: currentState.expanded,
      contextBarPosition: currentState.contextBarPosition,
      paneSizes: currentState.paneSizes,
      collapsedPaths: currentState.collapsedPaths,
      fileSearchRepoId: currentState.fileSearchRepoId,
      isLeftSidebarVisible: currentState.isLeftSidebarVisible,
      isRightSidebarVisible: currentState.isRightSidebarVisible,
      isTerminalVisible: currentState.isTerminalVisible,
      workspacePanelStates: currentState.workspacePanelStates,
      kanbanProjectViewsByProject: currentState.kanbanProjectViewsByProject,
    });

    try {
      await updateScratch({
        payload: {
          type: 'UI_PREFERENCES',
          data,
        },
      });
    } catch (e) {
      console.error('[useUiPreferencesScratch] Failed to save:', e);
    }
  }, [updateScratch]);

  const { debounced: debouncedSave } = useDebouncedCallback(saveToServer, 500);

  // Initialize store from server data when first loaded
  useEffect(() => {
    if (hasInitializedRef.current || isLoading || !isConnected) {
      return;
    }

    hasInitializedRef.current = true;

    if (scratchData) {
      // Server has data - apply it to store
      isApplyingServerDataRef.current = true;
      const serverState = scratchDataToStore(scratchData);

      // Merge server state into the store
      useUiPreferencesStore.setState({
        repoActions: serverState.repoActions,
        expanded: serverState.expanded,
        contextBarPosition: serverState.contextBarPosition,
        paneSizes: serverState.paneSizes,
        collapsedPaths: serverState.collapsedPaths,
        fileSearchRepoId: serverState.fileSearchRepoId,
        isLeftSidebarVisible: serverState.isLeftSidebarVisible,
        isRightSidebarVisible: serverState.isRightSidebarVisible,
        isTerminalVisible: serverState.isTerminalVisible,
        workspacePanelStates: serverState.workspacePanelStates,
        kanbanProjectViewsByProject: serverState.kanbanProjectViewsByProject,
      });

      // Allow a brief delay for state to settle
      setTimeout(() => {
        isApplyingServerDataRef.current = false;
      }, 100);
    }
  }, [isLoading, isConnected, scratchData]);

  // Subscribe to store changes and save to server
  useEffect(() => {
    const unsubscribe = useUiPreferencesStore.subscribe(() => {
      if (!isApplyingServerDataRef.current && hasInitializedRef.current) {
        debouncedSave();
      }
    });

    return unsubscribe;
  }, [debouncedSave]);

  return {
    isLoading,
    isConnected,
    // Expose for debugging
    scratchData,
    storeState,
  };
}
