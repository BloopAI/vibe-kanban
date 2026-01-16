import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';
import type { TaskStatus } from 'shared/types';

export type SortField = 'created_at' | 'title' | 'status';
export type SortDirection = 'asc' | 'desc';

interface TaskFiltersState {
  // Status filter - array of selected statuses (empty = all)
  statusFilter: TaskStatus[];
  setStatusFilter: (statuses: TaskStatus[]) => void;
  toggleStatusFilter: (status: TaskStatus) => void;
  clearStatusFilter: () => void;

  // Assignee filter - array of user IDs (empty = all)
  assigneeFilter: string[];
  setAssigneeFilter: (assignees: string[]) => void;
  toggleAssigneeFilter: (assigneeId: string) => void;
  clearAssigneeFilter: () => void;

  // Sort settings
  sortField: SortField;
  sortDirection: SortDirection;
  setSortField: (field: SortField) => void;
  setSortDirection: (direction: SortDirection) => void;
  toggleSortDirection: () => void;

  // Helper to check if any filters are active
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
}

const TaskFiltersContext = createContext<TaskFiltersState | null>(null);

interface TaskFiltersProviderProps {
  children: ReactNode;
}

export function TaskFiltersProvider({ children }: TaskFiltersProviderProps) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const toggleStatusFilter = useCallback((status: TaskStatus) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  }, []);

  const clearStatusFilter = useCallback(() => {
    setStatusFilter([]);
  }, []);

  const toggleAssigneeFilter = useCallback((assigneeId: string) => {
    setAssigneeFilter((prev) =>
      prev.includes(assigneeId)
        ? prev.filter((a) => a !== assigneeId)
        : [...prev, assigneeId]
    );
  }, []);

  const clearAssigneeFilter = useCallback(() => {
    setAssigneeFilter([]);
  }, []);

  const toggleSortDirection = useCallback(() => {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }, []);

  const hasActiveFilters = useMemo(
    () => statusFilter.length > 0 || assigneeFilter.length > 0,
    [statusFilter.length, assigneeFilter.length]
  );

  const clearAllFilters = useCallback(() => {
    setStatusFilter([]);
    setAssigneeFilter([]);
  }, []);

  const value: TaskFiltersState = {
    statusFilter,
    setStatusFilter,
    toggleStatusFilter,
    clearStatusFilter,
    assigneeFilter,
    setAssigneeFilter,
    toggleAssigneeFilter,
    clearAssigneeFilter,
    sortField,
    sortDirection,
    setSortField,
    setSortDirection,
    toggleSortDirection,
    hasActiveFilters,
    clearAllFilters,
  };

  return (
    <TaskFiltersContext.Provider value={value}>
      {children}
    </TaskFiltersContext.Provider>
  );
}

export function useTaskFilters(): TaskFiltersState {
  const context = useContext(TaskFiltersContext);
  if (!context) {
    throw new Error(
      'useTaskFilters must be used within a TaskFiltersProvider'
    );
  }
  return context;
}
