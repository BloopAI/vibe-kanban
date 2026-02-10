import type { IssuePriority } from 'shared/remote-types';
import type {
  KanbanFiltersData,
  KanbanFiltersOverridesData,
  KanbanProjectDraftData,
  KanbanProjectViewData,
  KanbanProjectViewOverridesData,
  UiPreferencesData,
} from 'shared/types';
import {
  DEFAULT_KANBAN_FILTER_STATE,
  DEFAULT_KANBAN_SHOW_WORKSPACES,
  KANBAN_ASSIGNEE_FILTER_VALUES,
  KANBAN_PROJECT_VIEW_IDS,
  getDefaultShowSubIssuesForView,
  type KanbanFilterState,
  type KanbanProjectDraftState,
  type KanbanProjectView,
  type KanbanProjectViewsState,
  type KanbanSortField,
} from '@/stores/useUiPreferencesStore';

const KANBAN_SORT_FIELDS: KanbanSortField[] = [
  'sort_order',
  'priority',
  'created_at',
  'updated_at',
  'title',
];

const BUILT_IN_VIEW_IDS = [
  KANBAN_PROJECT_VIEW_IDS.TEAM,
  KANBAN_PROJECT_VIEW_IDS.PERSONAL,
] as const;

type BuiltInViewId = (typeof BUILT_IN_VIEW_IDS)[number];

const isKanbanSortField = (value: string): value is KanbanSortField =>
  KANBAN_SORT_FIELDS.includes(value as KanbanSortField);

const isSortDirection = (value: string): value is 'asc' | 'desc' =>
  value === 'asc' || value === 'desc';

const isBuiltInViewId = (viewId: string): viewId is BuiltInViewId =>
  BUILT_IN_VIEW_IDS.includes(viewId as BuiltInViewId);

const arraysEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const cloneFilters = (filters: KanbanFilterState): KanbanFilterState => ({
  searchQuery: filters.searchQuery,
  priorities: [...filters.priorities],
  assigneeIds: [...filters.assigneeIds],
  tagIds: [...filters.tagIds],
  sortField: filters.sortField,
  sortDirection: filters.sortDirection,
});

const toDraftState = (view: KanbanProjectView): KanbanProjectDraftState => ({
  filters: cloneFilters(view.filters),
  showSubIssues: view.showSubIssues,
  showWorkspaces: view.showWorkspaces,
});

const normalizeSortDirection = (
  viewId: string,
  sortField: KanbanSortField,
  sortDirection: 'asc' | 'desc'
): 'asc' | 'desc' => {
  if (
    viewId === KANBAN_PROJECT_VIEW_IDS.PERSONAL &&
    sortField === 'priority' &&
    sortDirection === 'desc'
  ) {
    return 'asc';
  }

  return sortDirection;
};

const createDefaultBuiltInViews = (): Record<
  BuiltInViewId,
  KanbanProjectView
> => {
  const team: KanbanProjectView = {
    id: KANBAN_PROJECT_VIEW_IDS.TEAM,
    name: 'Team',
    filters: cloneFilters(DEFAULT_KANBAN_FILTER_STATE),
    showSubIssues: getDefaultShowSubIssuesForView(KANBAN_PROJECT_VIEW_IDS.TEAM),
    showWorkspaces: DEFAULT_KANBAN_SHOW_WORKSPACES,
  };

  const personal: KanbanProjectView = {
    id: KANBAN_PROJECT_VIEW_IDS.PERSONAL,
    name: 'Personal',
    filters: {
      ...cloneFilters(DEFAULT_KANBAN_FILTER_STATE),
      assigneeIds: [KANBAN_ASSIGNEE_FILTER_VALUES.SELF],
      sortField: 'priority',
      sortDirection: 'asc',
    },
    showSubIssues: getDefaultShowSubIssuesForView(
      KANBAN_PROJECT_VIEW_IDS.PERSONAL
    ),
    showWorkspaces: DEFAULT_KANBAN_SHOW_WORKSPACES,
  };

  return {
    [KANBAN_PROJECT_VIEW_IDS.TEAM]: team,
    [KANBAN_PROJECT_VIEW_IDS.PERSONAL]: personal,
  };
};

const toScratchFilters = (filters: KanbanFilterState): KanbanFiltersData => ({
  search_query: filters.searchQuery,
  priorities: [...filters.priorities],
  assignee_ids: [...filters.assigneeIds],
  tag_ids: [...filters.tagIds],
  sort_field: filters.sortField,
  sort_direction: filters.sortDirection,
});

const fromScratchFilters = (
  viewId: string,
  filters: KanbanFiltersData | undefined,
  fallback: KanbanFilterState
): KanbanFilterState => {
  const sortFieldCandidate = filters?.sort_field;
  const sortField =
    sortFieldCandidate && isKanbanSortField(sortFieldCandidate)
      ? sortFieldCandidate
      : fallback.sortField;
  const sortDirectionCandidate = filters?.sort_direction;
  const sortDirection = normalizeSortDirection(
    viewId,
    sortField,
    sortDirectionCandidate && isSortDirection(sortDirectionCandidate)
      ? sortDirectionCandidate
      : fallback.sortDirection
  );

  return {
    searchQuery: filters?.search_query ?? fallback.searchQuery,
    priorities: (
      filters?.priorities as IssuePriority[] | undefined
    )?.slice() ?? [...fallback.priorities],
    assigneeIds: filters?.assignee_ids?.slice() ?? [...fallback.assigneeIds],
    tagIds: filters?.tag_ids?.slice() ?? [...fallback.tagIds],
    sortField,
    sortDirection,
  };
};

const buildFilterOverrides = (
  base: KanbanFilterState,
  next: KanbanFilterState
): KanbanFiltersOverridesData | undefined => {
  const overrides: KanbanFiltersOverridesData = {};

  if (next.searchQuery !== base.searchQuery) {
    overrides.search_query = next.searchQuery;
  }

  if (!arraysEqual(base.priorities, next.priorities)) {
    overrides.priorities = [...next.priorities];
  }

  if (!arraysEqual(base.assigneeIds, next.assigneeIds)) {
    overrides.assignee_ids = [...next.assigneeIds];
  }

  if (!arraysEqual(base.tagIds, next.tagIds)) {
    overrides.tag_ids = [...next.tagIds];
  }

  if (next.sortField !== base.sortField) {
    overrides.sort_field = next.sortField;
  }

  if (next.sortDirection !== base.sortDirection) {
    overrides.sort_direction = next.sortDirection;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
};

const applyFilterOverrides = (
  viewId: string,
  base: KanbanFilterState,
  overrides: KanbanFiltersOverridesData | undefined
): KanbanFilterState => {
  const sortFieldCandidate = overrides?.sort_field;
  const sortField =
    sortFieldCandidate && isKanbanSortField(sortFieldCandidate)
      ? sortFieldCandidate
      : base.sortField;
  const sortDirectionCandidate = overrides?.sort_direction;
  const sortDirection = normalizeSortDirection(
    viewId,
    sortField,
    sortDirectionCandidate && isSortDirection(sortDirectionCandidate)
      ? sortDirectionCandidate
      : base.sortDirection
  );

  return {
    searchQuery: overrides?.search_query ?? base.searchQuery,
    priorities: (
      overrides?.priorities as IssuePriority[] | undefined
    )?.slice() ?? [...base.priorities],
    assigneeIds: overrides?.assignee_ids?.slice() ?? [...base.assigneeIds],
    tagIds: overrides?.tag_ids?.slice() ?? [...base.tagIds],
    sortField,
    sortDirection,
  };
};

const buildViewOverrides = (
  base: KanbanProjectView,
  next: KanbanProjectView
): KanbanProjectViewOverridesData | undefined => {
  const overrides: KanbanProjectViewOverridesData = {};
  const filters = buildFilterOverrides(base.filters, next.filters);

  if (filters) {
    overrides.filters = filters;
  }

  if (next.showSubIssues !== base.showSubIssues) {
    overrides.show_sub_issues = next.showSubIssues;
  }

  if (next.showWorkspaces !== base.showWorkspaces) {
    overrides.show_workspaces = next.showWorkspaces;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
};

const applyViewOverrides = (
  base: KanbanProjectView,
  overrides: KanbanProjectViewOverridesData | undefined
): KanbanProjectView => ({
  ...base,
  filters: applyFilterOverrides(base.id, base.filters, overrides?.filters),
  showSubIssues: overrides?.show_sub_issues ?? base.showSubIssues,
  showWorkspaces: overrides?.show_workspaces ?? base.showWorkspaces,
});

const toScratchCustomView = (
  view: KanbanProjectView
): KanbanProjectViewData => ({
  id: view.id,
  name: view.name,
  filters: toScratchFilters(view.filters),
  show_sub_issues: view.showSubIssues,
  show_workspaces: view.showWorkspaces,
});

const fromScratchCustomView = (
  view: KanbanProjectViewData
): KanbanProjectView => {
  const fallbackFilters = cloneFilters(DEFAULT_KANBAN_FILTER_STATE);

  return {
    id: view.id,
    name: view.name,
    filters: fromScratchFilters(view.id, view.filters, fallbackFilters),
    showSubIssues:
      view.show_sub_issues ?? getDefaultShowSubIssuesForView(view.id),
    showWorkspaces: view.show_workspaces ?? DEFAULT_KANBAN_SHOW_WORKSPACES,
  };
};

const getViewById = (
  views: KanbanProjectView[],
  defaults: Record<BuiltInViewId, KanbanProjectView>,
  viewId: string
): KanbanProjectView | undefined =>
  views.find((view) => view.id === viewId) ?? defaults[viewId as BuiltInViewId];

export const toScratchKanbanProjectViews = (
  viewStates: Record<string, KanbanProjectViewsState>
): UiPreferencesData['kanban_project_views_by_project'] => {
  const result: UiPreferencesData['kanban_project_views_by_project'] = {};

  for (const [projectId, viewState] of Object.entries(viewStates)) {
    const defaultBuiltInViews = createDefaultBuiltInViews();
    const builtInViewOverrides: Record<string, KanbanProjectViewOverridesData> =
      {};

    for (const builtInViewId of BUILT_IN_VIEW_IDS) {
      const currentView =
        viewState.views.find((view) => view.id === builtInViewId) ??
        defaultBuiltInViews[builtInViewId];
      const overrides = buildViewOverrides(
        defaultBuiltInViews[builtInViewId],
        currentView
      );

      if (overrides) {
        builtInViewOverrides[builtInViewId] = overrides;
      }
    }

    const customViews = viewState.views
      .filter((view) => !isBuiltInViewId(view.id))
      .map(toScratchCustomView);

    const activeView =
      getViewById(
        viewState.views,
        defaultBuiltInViews,
        viewState.activeViewId
      ) ?? defaultBuiltInViews[KANBAN_PROJECT_VIEW_IDS.TEAM];
    const draftAsView: KanbanProjectView = {
      ...activeView,
      filters: cloneFilters(viewState.draft.filters),
      showSubIssues: viewState.draft.showSubIssues,
      showWorkspaces: viewState.draft.showWorkspaces,
    };
    const draftOverrides = buildViewOverrides(activeView, draftAsView);
    const draft: KanbanProjectDraftData | null = draftOverrides
      ? {
          view_id: activeView.id,
          overrides: draftOverrides,
        }
      : null;

    result[projectId] = {
      active_view_id: activeView.id,
      custom_views: customViews,
      built_in_view_overrides: builtInViewOverrides,
      ...(draft ? { draft } : {}),
    };
  }

  return result;
};

export const fromScratchKanbanProjectViews = (
  persisted: UiPreferencesData['kanban_project_views_by_project'] | undefined
): Record<string, KanbanProjectViewsState> => {
  const result: Record<string, KanbanProjectViewsState> = {};

  for (const [projectId, persistedState] of Object.entries(persisted ?? {})) {
    if (!persistedState) {
      continue;
    }

    const defaultBuiltInViews = createDefaultBuiltInViews();
    const builtInViews = BUILT_IN_VIEW_IDS.map((builtInViewId) =>
      applyViewOverrides(
        defaultBuiltInViews[builtInViewId],
        persistedState.built_in_view_overrides?.[builtInViewId]
      )
    );
    const customViews = (persistedState.custom_views ?? [])
      .map(fromScratchCustomView)
      .filter((view) => !isBuiltInViewId(view.id));
    const views = [...builtInViews, ...customViews];
    const activeView =
      getViewById(views, defaultBuiltInViews, persistedState.active_view_id) ??
      defaultBuiltInViews[KANBAN_PROJECT_VIEW_IDS.TEAM];
    const draftBaseView =
      getViewById(
        views,
        defaultBuiltInViews,
        persistedState.draft?.view_id ?? activeView.id
      ) ?? activeView;
    const draftView = applyViewOverrides(
      draftBaseView,
      persistedState.draft?.overrides
    );

    result[projectId] = {
      activeViewId: activeView.id,
      views,
      draft: toDraftState(draftView),
    };
  }

  return result;
};
