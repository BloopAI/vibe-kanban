import { createContext, Dispatch, SetStateAction } from 'react';
import type {
  AttemptData,
  EditorType,
  TaskAttempt,
  TaskAttemptState,
  TaskWithAttemptStatus,
  WorktreeDiff,
} from 'shared/types.ts';

export interface TaskDetailsContextValue {
  task: TaskWithAttemptStatus;
  projectId: string;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  selectedAttempt: TaskAttempt | null;
  setSelectedAttempt: Dispatch<SetStateAction<TaskAttempt | null>>;
  isStopping: boolean;
  setIsStopping: Dispatch<SetStateAction<boolean>>;
  deletingFiles: Set<string>;
  setDeletingFiles: Dispatch<SetStateAction<Set<string>>>;
  fileToDelete: string | null;
  setFileToDelete: Dispatch<SetStateAction<string | null>>;
  setDiffError: Dispatch<SetStateAction<string | null>>;
  fetchDiff: (isBackgroundRefresh?: boolean) => Promise<void>;
  diff: WorktreeDiff | null;
  diffError: string | null;
  diffLoading: boolean;
  isBackgroundRefreshing: boolean;
  setDiff: Dispatch<SetStateAction<WorktreeDiff | null>>;
  setDiffLoading: Dispatch<SetStateAction<boolean>>;
  handleOpenInEditor: (editorType?: EditorType) => Promise<void>;
  isAttemptRunning: boolean;
  fetchExecutionState: (
    attemptId: string,
    taskId: string
  ) => Promise<void> | void;
  executionState: TaskAttemptState | null;
  attemptData: AttemptData;
  setAttemptData: Dispatch<SetStateAction<AttemptData>>;
  fetchAttemptData: (attemptId: string, taskId: string) => Promise<void> | void;
}

export const TaskDetailsContext = createContext<TaskDetailsContextValue>(
  {} as TaskDetailsContextValue
);
