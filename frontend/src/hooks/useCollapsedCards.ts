import { useCallback, useState, useEffect } from 'react';

const STORAGE_KEY_PREFIX = 'collapsedCards';

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
  } catch {
    // ignorar errores de localStorage
  }
}

export function useCollapsedCards(projectId: string) {
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(() =>
    loadCollapsedCards(projectId)
  );

  // sincronizar con localStorage cuando cambia
  useEffect(() => {
    saveCollapsedCards(projectId, collapsedCards);
  }, [projectId, collapsedCards]);

  // recargar cuando cambia el projectId
  useEffect(() => {
    setCollapsedCards(loadCollapsedCards(projectId));
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
