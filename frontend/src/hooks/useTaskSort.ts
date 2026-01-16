import { useMemo } from 'react';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import type { SortField, SortDirection } from '@/contexts/TaskFiltersContext';

const STATUS_ORDER: Record<TaskStatus, number> = {
  todo: 0,
  inprogress: 1,
  inreview: 2,
  done: 3,
  cancelled: 4,
};

export function useTaskSort<T extends TaskWithAttemptStatus>(
  tasks: T[],
  sortField: SortField,
  sortDirection: SortDirection
): T[] {
  return useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'created_at':
          comparison =
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime();
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'status':
          comparison = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [tasks, sortField, sortDirection]);
}

export function useTaskFilter<T extends TaskWithAttemptStatus>(
  tasks: T[],
  statusFilter: TaskStatus[],
  searchQuery: string
): T[] {
  return useMemo(() => {
    let filtered = tasks;

    // Apply status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter((task) => statusFilter.includes(task.status));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const normalizedSearch = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((task) => {
        const titleMatch = task.title.toLowerCase().includes(normalizedSearch);
        const descMatch = task.description
          ?.toLowerCase()
          .includes(normalizedSearch);
        return titleMatch || descMatch;
      });
    }

    return filtered;
  }, [tasks, statusFilter, searchQuery]);
}
