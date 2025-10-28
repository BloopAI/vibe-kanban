import { useReducer, useCallback } from 'react';
import type { TaskStatus, ExecutorProfileId } from 'shared/types';

export interface TaskFormState {
  title: string;
  description: string;
  status: TaskStatus;
  autoStart: boolean;
  selectedExecutorProfile: ExecutorProfileId | null;
  selectedBranch: string;
  isSubmitting: boolean;
  showDiscardWarning: boolean;
}

type TaskFormAction =
  | { type: 'SET_TITLE'; value: string }
  | { type: 'SET_DESCRIPTION'; value: string }
  | { type: 'SET_STATUS'; value: TaskStatus }
  | { type: 'SET_AUTO_START'; value: boolean }
  | { type: 'SET_EXECUTOR_PROFILE'; value: ExecutorProfileId | null }
  | { type: 'SET_BRANCH'; value: string }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'SET_DISCARD_WARNING'; value: boolean }
  | { type: 'INIT'; value: Partial<TaskFormState> };

function taskFormReducer(
  state: TaskFormState,
  action: TaskFormAction
): TaskFormState {
  switch (action.type) {
    case 'SET_TITLE':
      return { ...state, title: action.value };
    case 'SET_DESCRIPTION':
      return { ...state, description: action.value };
    case 'SET_STATUS':
      return { ...state, status: action.value };
    case 'SET_AUTO_START':
      return { ...state, autoStart: action.value };
    case 'SET_EXECUTOR_PROFILE':
      return { ...state, selectedExecutorProfile: action.value };
    case 'SET_BRANCH':
      return { ...state, selectedBranch: action.value };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.value };
    case 'SET_DISCARD_WARNING':
      return { ...state, showDiscardWarning: action.value };
    case 'INIT':
      return { ...state, ...action.value };
    default:
      return state;
  }
}

const initialState: TaskFormState = {
  title: '',
  description: '',
  status: 'todo',
  autoStart: true,
  selectedExecutorProfile: null,
  selectedBranch: '',
  isSubmitting: false,
  showDiscardWarning: false,
};

export function useTaskFormReducer(initial?: Partial<TaskFormState>) {
  const [state, dispatch] = useReducer(taskFormReducer, {
    ...initialState,
    ...initial,
  });

  const setTitle = useCallback(
    (value: string) => dispatch({ type: 'SET_TITLE', value }),
    []
  );

  const setDescription = useCallback(
    (value: string) => dispatch({ type: 'SET_DESCRIPTION', value }),
    []
  );

  const setStatus = useCallback(
    (value: TaskStatus) => dispatch({ type: 'SET_STATUS', value }),
    []
  );

  const setAutoStart = useCallback(
    (value: boolean) => dispatch({ type: 'SET_AUTO_START', value }),
    []
  );

  const setSelectedExecutorProfile = useCallback(
    (value: ExecutorProfileId | null) =>
      dispatch({ type: 'SET_EXECUTOR_PROFILE', value }),
    []
  );

  const setSelectedBranch = useCallback(
    (value: string) => dispatch({ type: 'SET_BRANCH', value }),
    []
  );

  const setSubmitting = useCallback(
    (value: boolean) => dispatch({ type: 'SET_SUBMITTING', value }),
    []
  );

  const setDiscardWarning = useCallback(
    (value: boolean) => dispatch({ type: 'SET_DISCARD_WARNING', value }),
    []
  );

  const init = useCallback(
    (value: Partial<TaskFormState>) => dispatch({ type: 'INIT', value }),
    []
  );

  return {
    state,
    dispatch,
    setTitle,
    setDescription,
    setStatus,
    setAutoStart,
    setSelectedExecutorProfile,
    setSelectedBranch,
    setSubmitting,
    setDiscardWarning,
    init,
  };
}
