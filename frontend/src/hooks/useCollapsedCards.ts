import { useCallback, useState, useEffect, useRef } from 'react';
import { useDebouncedCallback } from './useDebouncedCallback';

const STORAGE_KEY_PREFIX = 'collapsedCards';
const SAVE_DEBOUNCE_MS = 300;

function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}.${projectId}`;
}

function loadCollapsedCards(projectId: string): Set<string> {
  try {
    const stored = localStorage.getItem(getStorageKey(projectId));
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedCards(projectId: string, collapsed: Set<string>): void {
  try {
    localStorage.setItem(
      getStorageKey(projectId),
      JSON.stringify([...collapsed])
    );
  } catch (error) {
    // localStorage quota exceeded or unavailable
    if (import.meta.env.DEV) {
      console.warn('Failed to save collapsed cards:', error);
    }
  }
}

/**
 * Manages collapse state for task cards with localStorage persistence.
 * Collapsed state is scoped per project and survives page refreshes.
 *
 * @param projectId - The project ID to scope collapsed cards to
 * @returns Collapse state checkers and control functions
 */
export function useCollapsedCards(projectId: string) {
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(() =>
    loadCollapsedCards(projectId)
  );

  // track whether we're loading to prevent redundant saves
  const isLoadingRef = useRef(false);

  // debounce localStorage writes for better performance during rapid interactions
  const { debounced: debouncedSave } = useDebouncedCallback(
    (pid: string, cards: Set<string>) => {
      saveCollapsedCards(pid, cards);
    },
    SAVE_DEBOUNCE_MS
  );

  // sync to localStorage when state changes (debounced, skip during load)
  useEffect(() => {
    if (!isLoadingRef.current) {
      debouncedSave(projectId, collapsedCards);
    }
  }, [projectId, collapsedCards, debouncedSave]);

  // reload state when projectId changes
  useEffect(() => {
    isLoadingRef.current = true;
    setCollapsedCards(loadCollapsedCards(projectId));
    // use microtask to ensure state update completes before allowing saves
    queueMicrotask(() => {
      isLoadingRef.current = false;
    });
  }, [projectId]);

  const isCollapsed = useCallback(
    (cardId: string) => collapsedCards.has(cardId),
    [collapsedCards]
  );

  const toggleCollapsed = useCallback((cardId: string) => {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback((cardIds: string[]) => {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      cardIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const expandAll = useCallback((cardIds: string[]) => {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      cardIds.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const areAllCollapsed = useCallback(
    (cardIds: string[]) => {
      if (cardIds.length === 0) return false;
      return cardIds.every((id) => collapsedCards.has(id));
    },
    [collapsedCards]
  );

  return {
    isCollapsed,
    toggleCollapsed,
    collapseAll,
    expandAll,
    areAllCollapsed,
  };
}
