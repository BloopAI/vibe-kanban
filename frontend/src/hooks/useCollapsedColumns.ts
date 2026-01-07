import { useCallback, useState, useEffect, useRef } from 'react';
import { useDebouncedCallback } from './useDebouncedCallback';
import { TaskStatus } from '../../../shared/types';

const STORAGE_KEY_PREFIX = 'collapsedColumns';
const SAVE_DEBOUNCE_MS = 300;

function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}.${projectId}`;
}

function loadCollapsedColumns(projectId: string): Set<TaskStatus> {
  try {
    const stored = localStorage.getItem(getStorageKey(projectId));
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedColumns(
  projectId: string,
  collapsed: Set<TaskStatus>
): void {
  try {
    localStorage.setItem(
      getStorageKey(projectId),
      JSON.stringify([...collapsed])
    );
  } catch (error) {
    // localStorage quota exceeded or unavailable
    if (import.meta.env.DEV) {
      console.warn('Failed to save collapsed columns:', error);
    }
  }
}

/**
 * Manages collapse state for kanban columns with localStorage persistence.
 * Collapsed state is scoped per project and survives page refreshes.
 *
 * @param projectId - The project ID to scope collapsed columns to
 * @returns Collapse state checkers and control functions
 */
export function useCollapsedColumns(projectId: string) {
  const [collapsedColumns, setCollapsedColumns] = useState<Set<TaskStatus>>(
    () => loadCollapsedColumns(projectId)
  );

  // track whether we're loading to prevent redundant saves
  const isLoadingRef = useRef(false);

  // debounce localStorage writes for better performance during rapid interactions
  const { debounced: debouncedSave } = useDebouncedCallback(
    (pid: string, columns: Set<TaskStatus>) => {
      saveCollapsedColumns(pid, columns);
    },
    SAVE_DEBOUNCE_MS
  );

  // sync to localStorage when state changes (debounced, skip during load)
  useEffect(() => {
    if (!isLoadingRef.current) {
      debouncedSave(projectId, collapsedColumns);
    }
  }, [projectId, collapsedColumns, debouncedSave]);

  // reload state when projectId changes
  useEffect(() => {
    isLoadingRef.current = true;
    setCollapsedColumns(loadCollapsedColumns(projectId));
    // use microtask to ensure state update completes before allowing saves
    queueMicrotask(() => {
      isLoadingRef.current = false;
    });
  }, [projectId]);

  const isColumnCollapsed = useCallback(
    (status: TaskStatus) => collapsedColumns.has(status),
    [collapsedColumns]
  );

  const toggleColumnCollapsed = useCallback((status: TaskStatus) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  return {
    isColumnCollapsed,
    toggleColumnCollapsed,
  };
}
