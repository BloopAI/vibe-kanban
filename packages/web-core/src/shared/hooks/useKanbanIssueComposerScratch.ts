import { useEffect, useRef } from 'react';
import { useAppRuntime } from '@/shared/hooks/useAppRuntime';
import {
  useKanbanIssueComposerStore,
  type KanbanIssueComposerEntry,
} from '@/shared/stores/useKanbanIssueComposerStore';

const STORAGE_KEY = 'vk-kanban-issue-composer';

function readStoredComposerState(): Record<
  string,
  KanbanIssueComposerEntry | undefined
> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, KanbanIssueComposerEntry | undefined>;
  } catch {
    return null;
  }
}

function writeStoredComposerState(
  byKey: Record<string, KanbanIssueComposerEntry | undefined>
): void {
  try {
    const filtered: Record<string, KanbanIssueComposerEntry> = {};
    for (const [key, entry] of Object.entries(byKey)) {
      if (entry) filtered[key] = entry;
    }

    if (Object.keys(filtered).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch {
    // Quota exceeded or unavailable
  }
}

/**
 * Syncs KanbanIssueComposerStore to localStorage on remote-web.
 * No-op on local runtime. Call once at the app root level.
 */
export function useKanbanIssueComposerScratch() {
  const runtime = useAppRuntime();
  const isRemote = runtime === 'remote';
  const hasInitializedRef = useRef(false);
  const isApplyingRef = useRef(false);

  useEffect(() => {
    if (!isRemote || hasInitializedRef.current) return;

    hasInitializedRef.current = true;

    const stored = readStoredComposerState();
    if (!stored) return;

    isApplyingRef.current = true;
    useKanbanIssueComposerStore.setState({ byKey: stored });

    setTimeout(() => {
      isApplyingRef.current = false;
    }, 100);
  }, [isRemote]);

  useEffect(() => {
    if (!isRemote) return;

    const unsubscribe = useKanbanIssueComposerStore.subscribe((state) => {
      if (isApplyingRef.current || !hasInitializedRef.current) return;
      writeStoredComposerState(state.byKey);
    });

    return unsubscribe;
  }, [isRemote]);
}
