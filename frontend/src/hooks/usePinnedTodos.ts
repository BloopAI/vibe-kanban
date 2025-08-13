import { useMemo } from 'react';
import type { TodoItem } from 'shared/types';

interface UsePinnedTodosResult {
  todos: TodoItem[];
  lastUpdated: string | null;
}

/**
 * Hook that extracts and maintains the latest TODO state from normalized conversation entries.
 * Filters for TodoManagement ActionType entries and returns the most recent todo list.
 */
export const usePinnedTodos = (entries: any[]): UsePinnedTodosResult => {
  return useMemo(() => {
    let latestTodos: TodoItem[] = [];
    let lastUpdatedTime: string | null = null;

    for (const entry of entries) {
      if (entry.channel === 'normalized' && entry.payload) {
        const normalizedEntry = entry.payload as any;

        if (
          normalizedEntry.entry_type?.type === 'tool_use' &&
          normalizedEntry.entry_type?.action_type?.action === 'todo_management'
        ) {
          const actionType = normalizedEntry.entry_type.action_type;
          const partialTodos = actionType.todos || [];
          const currentTimestamp =
            normalizedEntry.timestamp || new Date().toISOString();

          // Only update latestTodos if we have meaningful content OR this is our first entry
          const hasMeaningfulTodos =
            partialTodos.length > 0 &&
            partialTodos.every(
              (todo: TodoItem) =>
                todo.content && todo.content.trim().length > 0 && todo.status
            );
          const isNewerThanLatest =
            !lastUpdatedTime || currentTimestamp >= lastUpdatedTime;

          if (
            hasMeaningfulTodos ||
            (isNewerThanLatest && latestTodos.length === 0)
          ) {
            latestTodos = partialTodos;
            lastUpdatedTime = currentTimestamp;
          }
        }
      }
    }

    return {
      todos: latestTodos,
      lastUpdated: lastUpdatedTime,
    };
  }, [entries]);
};
