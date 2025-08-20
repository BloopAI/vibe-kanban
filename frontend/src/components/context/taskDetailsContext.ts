import { createContext, Dispatch, SetStateAction } from 'react';
import type {
  EditorType,
  TaskAttempt,
  TaskWithAttemptStatus,
  BranchStatus,
} from 'shared/types';
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
  fetchAttemptData: (attemptId: string) => Promise<void> | void;
  isAttemptRunning: boolean;
  defaultFollowUpVariant: string | null;
  branchStatus: BranchStatus | null;
  setBranchStatus: Dispatch<SetStateAction<BranchStatus | null>>;
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

interface TaskBackgroundRefreshContextValue {
  isBackgroundRefreshing: boolean;
}

export const TaskBackgroundRefreshContext =
  createContext<TaskBackgroundRefreshContextValue>(
    {} as TaskBackgroundRefreshContextValue
  );
