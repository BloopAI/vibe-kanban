import { useMemo, useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RepoAction } from '@/components/ui-new/primitives/RepoCard';

export const RIGHT_MAIN_PANEL_MODES = {
  CHANGES: 'changes',
  LOGS: 'logs',
  PREVIEW: 'preview',
} as const;

export type RightMainPanelMode =
  (typeof RIGHT_MAIN_PANEL_MODES)[keyof typeof RIGHT_MAIN_PANEL_MODES];

export type ContextBarPosition =
  | 'top-left'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-right';

// Centralized persist keys for type safety
export const PERSIST_KEYS = {
  // Sidebar sections
  workspacesSidebarArchived: 'workspaces-sidebar-archived',
  // Git panel sections
  gitAdvancedSettings: 'git-advanced-settings',
  gitPanelRepositories: 'git-panel-repositories',
  gitPanelProject: 'git-panel-project',
  gitPanelAddRepositories: 'git-panel-add-repositories',
  // Process panel sections
  processesSection: 'processes-section',
  // Changes panel sections
  changesSection: 'changes-section',
  // Preview panel sections
  devServerSection: 'dev-server-section',
  // GitHub comments toggle
  showGitHubComments: 'show-github-comments',
  // Panel sizes
  rightMainPanel: 'right-main-panel',
  // Dynamic keys (use helper functions)
  repoCard: (repoId: string) => `repo-card-${repoId}` as const,
} as const;

// Check if screen is wide enough to keep sidebar visible
const isWideScreen = () => window.innerWidth > 2048;

export type PersistKey =
  | typeof PERSIST_KEYS.workspacesSidebarArchived
  | typeof PERSIST_KEYS.gitAdvancedSettings
  | typeof PERSIST_KEYS.gitPanelRepositories
  | typeof PERSIST_KEYS.gitPanelProject
  | typeof PERSIST_KEYS.gitPanelAddRepositories
  | typeof PERSIST_KEYS.processesSection
  | typeof PERSIST_KEYS.changesSection
  | typeof PERSIST_KEYS.devServerSection
  | typeof PERSIST_KEYS.showGitHubComments
  | typeof PERSIST_KEYS.rightMainPanel
  | `repo-card-${string}`
  | `diff:${string}`
  | `edit:${string}`
  | `plan:${string}`
  | `tool:${string}`
  | `todo:${string}`
  | `user:${string}`
  | `system:${string}`
  | `error:${string}`
  | `entry:${string}`;

type State = {
  // UI preferences
  repoActions: Record<string, RepoAction>;
  expanded: Record<string, boolean>;
  contextBarPosition: ContextBarPosition;
  paneSizes: Record<string, number | string>;
  collapsedPaths: Record<string, string[]>;

  // Layout state
  isLeftSidebarVisible: boolean;
  isLeftMainPanelVisible: boolean;
  isRightSidebarVisible: boolean;
  rightMainPanelMode: RightMainPanelMode | null;
  previewRefreshKey: number;

  // UI preferences actions
  setRepoAction: (repoId: string, action: RepoAction) => void;
  setExpanded: (key: string, value: boolean) => void;
  toggleExpanded: (key: string, defaultValue?: boolean) => void;
  setExpandedAll: (keys: string[], value: boolean) => void;
  setContextBarPosition: (position: ContextBarPosition) => void;
  setPaneSize: (key: string, size: number | string) => void;
  setCollapsedPaths: (key: string, paths: string[]) => void;

  // Layout actions
  toggleLeftSidebar: () => void;
  toggleLeftMainPanel: () => void;
  toggleRightSidebar: () => void;
  toggleRightMainPanelMode: (mode: RightMainPanelMode) => void;
  setRightMainPanelMode: (mode: RightMainPanelMode | null) => void;
  setLeftSidebarVisible: (value: boolean) => void;
  setLeftMainPanelVisible: (value: boolean) => void;
  triggerPreviewRefresh: () => void;
  resetForCreateMode: () => void;
};

export const useUiPreferencesStore = create<State>()(
  persist(
    (set, get) => ({
      // UI preferences state
      repoActions: {},
      expanded: {},
      contextBarPosition: 'middle-right',
      paneSizes: {},
      collapsedPaths: {},

      // Layout state
      isLeftSidebarVisible: true,
      isLeftMainPanelVisible: true,
      isRightSidebarVisible: true,
      rightMainPanelMode: null,
      previewRefreshKey: 0,

      // UI preferences actions
      setRepoAction: (repoId, action) =>
        set((s) => ({ repoActions: { ...s.repoActions, [repoId]: action } })),
      setExpanded: (key, value) =>
        set((s) => ({ expanded: { ...s.expanded, [key]: value } })),
      toggleExpanded: (key, defaultValue = true) =>
        set((s) => ({
          expanded: {
            ...s.expanded,
            [key]: !(s.expanded[key] ?? defaultValue),
          },
        })),
      setExpandedAll: (keys, value) =>
        set((s) => ({
          expanded: {
            ...s.expanded,
            ...Object.fromEntries(keys.map((k) => [k, value])),
          },
        })),
      setContextBarPosition: (position) =>
        set({ contextBarPosition: position }),
      setPaneSize: (key, size) =>
        set((s) => ({ paneSizes: { ...s.paneSizes, [key]: size } })),
      setCollapsedPaths: (key, paths) =>
        set((s) => ({ collapsedPaths: { ...s.collapsedPaths, [key]: paths } })),

      // Layout actions
      toggleLeftSidebar: () =>
        set((s) => ({ isLeftSidebarVisible: !s.isLeftSidebarVisible })),

      toggleLeftMainPanel: () => {
        const { isLeftMainPanelVisible, rightMainPanelMode } = get();
        if (isLeftMainPanelVisible && rightMainPanelMode === null) return;
        set({ isLeftMainPanelVisible: !isLeftMainPanelVisible });
      },

      toggleRightSidebar: () =>
        set((s) => ({ isRightSidebarVisible: !s.isRightSidebarVisible })),

      toggleRightMainPanelMode: (mode) => {
        const { rightMainPanelMode } = get();
        const isCurrentlyActive = rightMainPanelMode === mode;

        if (isCurrentlyActive) {
          set({
            rightMainPanelMode: null,
            isLeftSidebarVisible: true,
          });
        } else {
          set({
            rightMainPanelMode: mode,
            isLeftSidebarVisible: isWideScreen()
              ? get().isLeftSidebarVisible
              : false,
          });
        }
      },

      setRightMainPanelMode: (mode) => {
        if (mode !== null) {
          set({
            rightMainPanelMode: mode,
            isLeftSidebarVisible: isWideScreen()
              ? get().isLeftSidebarVisible
              : false,
          });
        } else {
          set({ rightMainPanelMode: null });
        }
      },

      setLeftSidebarVisible: (value) => set({ isLeftSidebarVisible: value }),

      setLeftMainPanelVisible: (value) =>
        set({ isLeftMainPanelVisible: value }),

      triggerPreviewRefresh: () =>
        set((s) => ({ previewRefreshKey: s.previewRefreshKey + 1 })),

      resetForCreateMode: () =>
        set({
          rightMainPanelMode: null,
        }),
    }),
    {
      name: 'ui-preferences',
      partialize: (state) => ({
        // UI preferences (all persisted)
        repoActions: state.repoActions,
        expanded: state.expanded,
        contextBarPosition: state.contextBarPosition,
        paneSizes: state.paneSizes,
        collapsedPaths: state.collapsedPaths,
        // Layout (only persist panel visibility, not mode states)
        isLeftSidebarVisible: state.isLeftSidebarVisible,
        isLeftMainPanelVisible: state.isLeftMainPanelVisible,
        isRightSidebarVisible: state.isRightSidebarVisible,
      }),
    }
  )
);

// Hook for repo action preference
export function useRepoAction(
  repoId: string,
  defaultAction: RepoAction = 'pull-request'
): [RepoAction, (action: RepoAction) => void] {
  const action = useUiPreferencesStore(
    (s) => s.repoActions[repoId] ?? defaultAction
  );
  const setAction = useUiPreferencesStore((s) => s.setRepoAction);
  return [action, (a) => setAction(repoId, a)];
}

// Hook for persisted expanded state
export function usePersistedExpanded(
  key: PersistKey,
  defaultValue = true
): [boolean, (value?: boolean) => void] {
  const expanded = useUiPreferencesStore(
    (s) => s.expanded[key] ?? defaultValue
  );
  const setExpanded = useUiPreferencesStore((s) => s.setExpanded);
  const toggleExpanded = useUiPreferencesStore((s) => s.toggleExpanded);

  const set = (value?: boolean) => {
    if (typeof value === 'boolean') setExpanded(key, value);
    else toggleExpanded(key, defaultValue);
  };

  return [expanded, set];
}

// Hook for context bar position
export function useContextBarPosition(): [
  ContextBarPosition,
  (position: ContextBarPosition) => void,
] {
  const position = useUiPreferencesStore((s) => s.contextBarPosition);
  const setPosition = useUiPreferencesStore((s) => s.setContextBarPosition);
  return [position, setPosition];
}

// Hook for pane size preference
export function usePaneSize(
  key: PersistKey,
  defaultSize: number | string
): [number | string, (size: number | string) => void] {
  const size = useUiPreferencesStore((s) => s.paneSizes[key] ?? defaultSize);
  const setSize = useUiPreferencesStore((s) => s.setPaneSize);
  return [size, (s) => setSize(key, s)];
}

// Hook for bulk expanded state operations
export function useExpandedAll() {
  const expanded = useUiPreferencesStore((s) => s.expanded);
  const setExpanded = useUiPreferencesStore((s) => s.setExpanded);
  const setExpandedAll = useUiPreferencesStore((s) => s.setExpandedAll);
  return { expanded, setExpanded, setExpandedAll };
}

// Hook for persisted file tree collapsed paths (per workspace)
export function usePersistedCollapsedPaths(
  workspaceId: string | undefined
): [Set<string>, (paths: Set<string>) => void] {
  const key = workspaceId ? `file-tree:${workspaceId}` : '';
  const paths = useUiPreferencesStore((s) => s.collapsedPaths[key] ?? []);
  const setPaths = useUiPreferencesStore((s) => s.setCollapsedPaths);

  const pathSet = useMemo(() => new Set(paths), [paths]);
  const setPathSet = useCallback(
    (newPaths: Set<string>) => {
      if (key) setPaths(key, [...newPaths]);
    },
    [key, setPaths]
  );

  return [pathSet, setPathSet];
}

// Layout convenience hooks
export const useIsRightMainPanelVisible = () =>
  useUiPreferencesStore((s) => s.rightMainPanelMode !== null);
