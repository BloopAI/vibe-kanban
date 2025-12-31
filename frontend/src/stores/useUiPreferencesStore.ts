import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RepoAction } from '@/components/ui-new/primitives/RepoCard';

// Centralized persist keys for type safety
export const PERSIST_KEYS = {
  // Sidebar sections
  workspacesSidebarActive: 'workspaces-sidebar-active',
  workspacesSidebarArchived: 'workspaces-sidebar-archived',
  // Git panel
  gitPanelCreateAddRepo: 'git-panel-create-add-repo',
  // Dynamic keys (use helper functions)
  repoCard: (repoId: string) => `repo-card-${repoId}` as const,
} as const;

export type PersistKey =
  | typeof PERSIST_KEYS.workspacesSidebarActive
  | typeof PERSIST_KEYS.workspacesSidebarArchived
  | typeof PERSIST_KEYS.gitPanelCreateAddRepo
  | `repo-card-${string}`;

type State = {
  repoActions: Record<string, RepoAction>;
  expanded: Record<string, boolean>;
  setRepoAction: (repoId: string, action: RepoAction) => void;
  setExpanded: (key: string, value: boolean) => void;
  toggleExpanded: (key: string, defaultValue?: boolean) => void;
};

const useUiPreferencesStore = create<State>()(
  persist(
    (set) => ({
      repoActions: {},
      expanded: {},
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
