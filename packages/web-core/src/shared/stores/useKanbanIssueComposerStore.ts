import { useCallback } from 'react';
import { create } from 'zustand';
import type { IssuePriority } from 'shared/remote-types';

export interface ProjectIssueCreateOptions {
  statusId?: string;
  priority?: IssuePriority;
  assigneeIds?: string[];
  parentIssueId?: string;
}

export interface KanbanIssueComposerDraft {
  title: string;
  description: string | null;
  statusId?: string;
  priority?: IssuePriority | null;
  assigneeIds?: string[];
  tagIds?: string[];
  createDraftWorkspace?: boolean;
  parentIssueId?: string;
}

export interface KanbanIssueComposerEntry {
  initial: KanbanIssueComposerDraft;
  draft: KanbanIssueComposerDraft;
}

interface KanbanIssueComposerState {
  byKey: Record<string, KanbanIssueComposerEntry | undefined>;
  openComposer: (
    key: string,
    options?: ProjectIssueCreateOptions | null
  ) => void;
  patchComposer: (
    key: string,
    patch: Partial<KanbanIssueComposerDraft>
  ) => void;
  resetComposer: (key: string) => void;
  closeComposer: (key: string) => void;
}

const LOCAL_HOST_SCOPE = 'local';

function normalizeComposerDraft(
  draft: Partial<KanbanIssueComposerDraft>
): KanbanIssueComposerDraft {
  return {
    title: draft.title ?? '',
    description: draft.description ?? null,
    ...(draft.statusId ? { statusId: draft.statusId } : {}),
    ...(draft.priority !== undefined ? { priority: draft.priority } : {}),
    ...(draft.assigneeIds !== undefined
      ? { assigneeIds: [...draft.assigneeIds] }
      : {}),
    ...(draft.tagIds !== undefined ? { tagIds: [...draft.tagIds] } : {}),
    ...(draft.createDraftWorkspace !== undefined
      ? { createDraftWorkspace: draft.createDraftWorkspace }
      : {}),
    ...(draft.parentIssueId ? { parentIssueId: draft.parentIssueId } : {}),
  };
}

export function buildKanbanIssueComposerKey(
  hostId: string | null,
  projectId: string
): string {
  const hostScope = hostId ?? LOCAL_HOST_SCOPE;
  return `${hostScope}:${projectId}`;
}

function toInitialComposerDraft(
  options?: ProjectIssueCreateOptions | null
): KanbanIssueComposerDraft {
  return normalizeComposerDraft({
    statusId: options?.statusId,
    priority: options?.priority,
    assigneeIds: options?.assigneeIds,
    parentIssueId: options?.parentIssueId,
    tagIds: [],
    createDraftWorkspace: false,
  });
}

export const useKanbanIssueComposerStore = create<KanbanIssueComposerState>()(
  (set) => ({
    byKey: {},
    openComposer: (key, options) =>
      set((state) => {
        const initial = toInitialComposerDraft(options);
        return {
          byKey: {
            ...state.byKey,
            [key]: {
              initial,
              draft: initial,
            },
          },
        };
      }),
    patchComposer: (key, patch) =>
      set((state) => {
        const current = state.byKey[key];
        if (!current) {
          return state;
        }

        return {
          byKey: {
            ...state.byKey,
            [key]: {
              ...current,
              draft: normalizeComposerDraft({
                ...current.draft,
                ...patch,
              }),
            },
          },
        };
      }),
    resetComposer: (key) =>
      set((state) => {
        const current = state.byKey[key];
        if (!current) {
          return state;
        }

        return {
          byKey: {
            ...state.byKey,
            [key]: {
              ...current,
              draft: current.initial,
            },
          },
        };
      }),
    closeComposer: (key) =>
      set((state) => {
        if (!(key in state.byKey)) {
          return state;
        }

        const { [key]: _removed, ...rest } = state.byKey;
        return { byKey: rest };
      }),
  })
);

export function useKanbanIssueComposer(
  composerKey: string | null
): KanbanIssueComposerEntry | null {
  return useKanbanIssueComposerStore(
    useCallback(
      (state) => (composerKey ? (state.byKey[composerKey] ?? null) : null),
      [composerKey]
    )
  );
}

export function openKanbanIssueComposer(
  composerKey: string,
  options?: ProjectIssueCreateOptions | null
): void {
  useKanbanIssueComposerStore.getState().openComposer(composerKey, options);
}

export function patchKanbanIssueComposer(
  composerKey: string,
  patch: Partial<KanbanIssueComposerDraft>
): void {
  useKanbanIssueComposerStore.getState().patchComposer(composerKey, patch);
}

export function resetKanbanIssueComposer(composerKey: string): void {
  useKanbanIssueComposerStore.getState().resetComposer(composerKey);
}

export function closeKanbanIssueComposer(composerKey: string): void {
  useKanbanIssueComposerStore.getState().closeComposer(composerKey);
}
