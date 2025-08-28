import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';
import type { TaskStatus, TaskTemplate } from 'shared/types';

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

interface TaskDialogOptions {
  onSuccess?: (task: Task) => void;
}

interface TaskDialogState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  task: Task | null;
  initialTemplate: TaskTemplate | null;
  afterSubmit?: (task: Task) => void;
}

interface TaskDialogAPI {
  // State for the dialog component
  dialogState: TaskDialogState;

  // Imperative actions
  openCreate: (options?: TaskDialogOptions) => void;
  openEdit: (task: Task, options?: TaskDialogOptions) => void;
  openFromTemplate: (
    template: TaskTemplate,
    options?: TaskDialogOptions
  ) => void;
  close: () => void;

  // For dialog component to call after successful operations
  handleSuccess: (task: Task) => void;
}

const TaskDialogContext = createContext<TaskDialogAPI | null>(null);

interface TaskDialogProviderProps {
  children: ReactNode;
}

export function TaskDialogProvider({ children }: TaskDialogProviderProps) {
  const [dialogState, setDialogState] = useState<TaskDialogState>({
    isOpen: false,
    mode: 'create',
    task: null,
    initialTemplate: null,
    afterSubmit: undefined,
  });

  const openCreate = useCallback((options?: TaskDialogOptions) => {
    setDialogState({
      isOpen: true,
      mode: 'create',
      task: null,
      initialTemplate: null,
      afterSubmit: options?.onSuccess,
    });
  }, []);

  const openEdit = useCallback((task: Task, options?: TaskDialogOptions) => {
    setDialogState({
      isOpen: true,
      mode: 'edit',
      task,
      initialTemplate: null,
      afterSubmit: options?.onSuccess,
    });
  }, []);

  const openFromTemplate = useCallback(
    (template: TaskTemplate, options?: TaskDialogOptions) => {
      setDialogState({
        isOpen: true,
        mode: 'create',
        task: null,
        initialTemplate: template,
        afterSubmit: options?.onSuccess,
      });
    },
    []
  );

  const close = useCallback(() => {
    setDialogState((prev) => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  const handleSuccess = useCallback(
    (task: Task) => {
      const { afterSubmit } = dialogState;
      if (afterSubmit) {
        afterSubmit(task);
      }
      close();
    },
    [dialogState, close]
  );

  const value = useMemo(
    () => ({
      dialogState,
      openCreate,
      openEdit,
      openFromTemplate,
      close,
      handleSuccess,
    }),
    [dialogState, openCreate, openEdit, openFromTemplate, close, handleSuccess]
  );

  return (
    <TaskDialogContext.Provider value={value}>
      {children}
    </TaskDialogContext.Provider>
  );
}

export function useTaskDialog(): TaskDialogAPI {
  const context = useContext(TaskDialogContext);
  if (!context) {
    throw new Error('useTaskDialog must be used within a TaskDialogProvider');
  }
  return context;
}

// Re-export types for convenience
export type { Task, TaskDialogOptions };
