import { useCallback } from 'react';
import { create } from 'zustand';
import type { IssuePriority } from 'shared/remote-types';

export type KanbanCreateDefaults = {
  statusId?: string;
  priority?: IssuePriority | null;
  assigneeIds?: string[];
  parentIssueId?: string;
};

interface KanbanCreateDefaultsState {
  byKey: Record<string, KanbanCreateDefaults | undefined>;
  setDefaults: (key: string, defaults: KanbanCreateDefaults) => void;
  patchDefaults: (key: string, patch: Partial<KanbanCreateDefaults>) => void;
  clearDefaults: (key: string) => void;
}

const LOCAL_HOST_SCOPE = 'local';

function normalizeDefaults(
  defaults: Partial<KanbanCreateDefaults>
): KanbanCreateDefaults {
  return {
    ...(defaults.statusId ? { statusId: defaults.statusId } : {}),
    ...(defaults.priority !== undefined ? { priority: defaults.priority } : {}),
    ...(defaults.assigneeIds !== undefined
      ? { assigneeIds: [...defaults.assigneeIds] }
      : {}),
    ...(defaults.parentIssueId
      ? { parentIssueId: defaults.parentIssueId }
      : {}),
  };
}

function isEmptyDefaults(defaults: KanbanCreateDefaults): boolean {
  return (
    defaults.statusId === undefined &&
    defaults.priority === undefined &&
    defaults.assigneeIds === undefined &&
    defaults.parentIssueId === undefined
  );
}

export function buildKanbanCreateDefaultsKey(
  hostId: string | null,
  projectId: string
): string {
  const hostScope = hostId ?? LOCAL_HOST_SCOPE;
  return `${hostScope}:${projectId}`;
}

export const useKanbanCreateDefaultsStore = create<KanbanCreateDefaultsState>()(
  (set) => ({
    byKey: {},
    setDefaults: (key, defaults) =>
      set((state) => {
        const normalizedDefaults = normalizeDefaults(defaults);
        if (isEmptyDefaults(normalizedDefaults)) {
          const { [key]: _removed, ...rest } = state.byKey;
          return { byKey: rest };
        }
        return {
          byKey: {
            ...state.byKey,
            [key]: normalizedDefaults,
          },
        };
      }),
    patchDefaults: (key, patch) =>
      set((state) => {
        const previousDefaults = state.byKey[key] ?? {};
        const normalizedDefaults = normalizeDefaults({
          ...previousDefaults,
          ...patch,
        });

        if (isEmptyDefaults(normalizedDefaults)) {
          const { [key]: _removed, ...rest } = state.byKey;
          return { byKey: rest };
        }

        return {
          byKey: {
            ...state.byKey,
            [key]: normalizedDefaults,
          },
        };
      }),
    clearDefaults: (key) =>
      set((state) => {
        if (!(key in state.byKey)) {
          return state;
        }
        const { [key]: _removed, ...rest } = state.byKey;
        return { byKey: rest };
      }),
  })
);

export function useKanbanCreateDefaults(
  defaultsKey: string | null
): KanbanCreateDefaults | null {
  return useKanbanCreateDefaultsStore(
    useCallback(
      (state) => (defaultsKey ? (state.byKey[defaultsKey] ?? null) : null),
      [defaultsKey]
    )
  );
}

export function setKanbanCreateDefaults(
  defaultsKey: string,
  defaults: KanbanCreateDefaults
): void {
  useKanbanCreateDefaultsStore.getState().setDefaults(defaultsKey, defaults);
}

export function patchKanbanCreateDefaults(
  defaultsKey: string,
  patch: Partial<KanbanCreateDefaults>
): void {
  useKanbanCreateDefaultsStore.getState().patchDefaults(defaultsKey, patch);
}

export function clearKanbanCreateDefaults(defaultsKey: string): void {
  useKanbanCreateDefaultsStore.getState().clearDefaults(defaultsKey);
}
