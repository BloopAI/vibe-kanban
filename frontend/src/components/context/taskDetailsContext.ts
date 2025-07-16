import { createContext, Dispatch, SetStateAction } from 'react';
import type {
  EditorType,
  TaskAttempt,
  TaskAttemptState,
  TaskWithAttemptStatus,
  WorktreeDiff,
} from 'shared/types.ts';
import { AttemptData } from '@/lib/types.ts';

export interface TaskDetailsContextValue {
  task: TaskWithAttemptStatus;
  projectId: string;
  handleOpenInEditor: (editorType?: EditorType) => Promise<void>;
  projectHasDevScript?: boolean;
}

export const TaskDetailsContext = createContext<TaskDetailsContextValue>(
  {} as TaskDetailsContextValue
);

interface TaskAttemptLoadingContextValue {
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
}

export const TaskAttemptLoadingContext =
  createContext<TaskAttemptLoadingContextValue>(
    {} as TaskAttemptLoadingContextValue
  );

interface TaskAttemptDataContextValue {
  attemptData: AttemptData;
  setAttemptData: Dispatch<SetStateAction<AttemptData>>;
  fetchAttemptData: (attemptId: string, taskId: string) => Promise<void> | void;
  isAttemptRunning: boolean;
}

export const TaskAttemptDataContext =
  createContext<TaskAttemptDataContextValue>({} as TaskAttemptDataContextValue);

interface TaskSelectedAttemptContextValue {
  selectedAttempt: TaskAttempt | null;
  setSelectedAttempt: Dispatch<SetStateAction<TaskAttempt | null>>;
}

export const TaskSelectedAttemptContext =
  createContext<TaskSelectedAttemptContextValue>(
    {} as TaskSelectedAttemptContextValue
  );

interface TaskAttemptStoppingContextValue {
  isStopping: boolean;
  setIsStopping: Dispatch<SetStateAction<boolean>>;
}

export const TaskAttemptStoppingContext =
  createContext<TaskAttemptStoppingContextValue>(
    {} as TaskAttemptStoppingContextValue
  );

interface TaskDeletingFilesContextValue {
  deletingFiles: Set<string>;
  setDeletingFiles: Dispatch<SetStateAction<Set<string>>>;
  fileToDelete: string | null;
  setFileToDelete: Dispatch<SetStateAction<string | null>>;
}

export const TaskDeletingFilesContext =
  createContext<TaskDeletingFilesContextValue>(
    {} as TaskDeletingFilesContextValue
  );

interface TaskDiffContextValue {
  setDiffError: Dispatch<SetStateAction<string | null>>;
  fetchDiff: (isBackgroundRefresh?: boolean) => Promise<void>;
  diff: WorktreeDiff | null;
  diffError: string | null;
  diffLoading: boolean;
  setDiff: Dispatch<SetStateAction<WorktreeDiff | null>>;
  setDiffLoading: Dispatch<SetStateAction<boolean>>;
}

export const TaskDiffContext = createContext<TaskDiffContextValue>(
  {} as TaskDiffContextValue
);

interface TaskBackgroundRefreshContextValue {
  isBackgroundRefreshing: boolean;
}

export const TaskBackgroundRefreshContext =
  createContext<TaskBackgroundRefreshContextValue>(
    {} as TaskBackgroundRefreshContextValue
  );

interface TaskExecutionStateContextValue {
  executionState: TaskAttemptState | null;
  fetchExecutionState: (
    attemptId: string,
    taskId: string
  ) => Promise<void> | void;
}

export const TaskExecutionStateContext =
  createContext<TaskExecutionStateContextValue>(
    {} as TaskExecutionStateContextValue
  );
