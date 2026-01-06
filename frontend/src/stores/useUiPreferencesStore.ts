import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RepoAction } from '@/components/ui-new/primitives/RepoCard';

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
  workspacesSidebarActive: 'workspaces-sidebar-active',
  workspacesSidebarArchived: 'workspaces-sidebar-archived',
  // Git panel
  gitAdvancedSettings: 'git-advanced-settings',
  gitPanelCreateAddRepo: 'git-panel-create-add-repo',
  // Context bar
  contextBarPosition: 'context-bar-position',
  // Pane sizes
  sidebarWidth: 'workspaces-sidebar-width',
  gitPanelWidth: 'workspaces-git-panel-width',
  changesPanelWidth: 'workspaces-changes-panel-width',
  fileTreeHeight: 'workspaces-file-tree-height',
  // Dynamic keys (use helper functions)
  repoCard: (repoId: string) => `repo-card-${repoId}` as const,
} as const;

export type PersistKey =
  | typeof PERSIST_KEYS.workspacesSidebarActive
  | typeof PERSIST_KEYS.workspacesSidebarArchived
  | typeof PERSIST_KEYS.gitAdvancedSettings
  | typeof PERSIST_KEYS.gitPanelCreateAddRepo
  | typeof PERSIST_KEYS.sidebarWidth
  | typeof PERSIST_KEYS.gitPanelWidth
  | typeof PERSIST_KEYS.changesPanelWidth
  | typeof PERSIST_KEYS.fileTreeHeight
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
  repoActions: Record<string, RepoAction>;
  expanded: Record<string, boolean>;
  contextBarPosition: ContextBarPosition;
  paneSizes: Record<string, number | string>;
  setRepoAction: (repoId: string, action: RepoAction) => void;
  setExpanded: (key: string, value: boolean) => void;
  toggleExpanded: (key: string, defaultValue?: boolean) => void;
  setExpandedAll: (keys: string[], value: boolean) => void;
  setContextBarPosition: (position: ContextBarPosition) => void;
  setPaneSize: (key: string, size: number | string) => void;
};

const useUiPreferencesStore = create<State>()(
  persist(
    (set) => ({
      repoActions: {},
      expanded: {},
      contextBarPosition: 'middle-right',
      paneSizes: {},
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
    }),
    { name: 'ui-preferences' }
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
  const setExpandedAll = useUiPreferencesStore((s) => s.setExpandedAll);
  return { expanded, setExpandedAll };
}
