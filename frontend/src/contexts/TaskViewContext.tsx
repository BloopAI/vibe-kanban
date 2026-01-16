import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';

export type TaskViewMode = 'kanban' | 'table';

const LOCAL_STORAGE_KEY = 'vibe-kanban-task-view-mode';

interface TaskViewState {
  viewMode: TaskViewMode;
  setViewMode: (mode: TaskViewMode) => void;
}

const TaskViewContext = createContext<TaskViewState | null>(null);

interface TaskViewProviderProps {
  children: ReactNode;
}

export function TaskViewProvider({ children }: TaskViewProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from URL param, then localStorage, then default to 'kanban'
  const [viewMode, setViewModeState] = useState<TaskViewMode>(() => {
    const urlParam = searchParams.get('taskView') as TaskViewMode;
    if (urlParam === 'kanban' || urlParam === 'table') {
      return urlParam;
    }

    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored === 'kanban' || stored === 'table') {
      return stored;
    }

    return 'kanban';
  });

  // Sync URL param when it changes externally
  useEffect(() => {
    const urlParam = searchParams.get('taskView') as TaskViewMode;
    if (urlParam && (urlParam === 'kanban' || urlParam === 'table')) {
      if (urlParam !== viewMode) {
        setViewModeState(urlParam);
      }
    }
  }, [searchParams, viewMode]);

  const setViewMode = useCallback(
    (mode: TaskViewMode) => {
      setViewModeState(mode);

      // Persist to localStorage
      localStorage.setItem(LOCAL_STORAGE_KEY, mode);

      // Update URL param
      const params = new URLSearchParams(searchParams);
      params.set('taskView', mode);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const value: TaskViewState = {
    viewMode,
    setViewMode,
  };

  return (
    <TaskViewContext.Provider value={value}>
      {children}
    </TaskViewContext.Provider>
  );
}

export function useTaskView(): TaskViewState {
  const context = useContext(TaskViewContext);
  if (!context) {
    throw new Error('useTaskView must be used within a TaskViewProvider');
  }
  return context;
}
