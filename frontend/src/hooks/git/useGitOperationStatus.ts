import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { BranchStatus } from 'shared/types';

type OperationKind = 'merge' | 'rebase';

type Phase = 'idle' | 'in-progress' | 'success' | 'error' | 'conflicts';

export interface OperationStatusState {
  kind: OperationKind | null;
  phase: Phase;
  message?: string;
  sawRebaseInProgress?: boolean;
}

type Action =
  | { type: 'start'; kind: OperationKind; message?: string }
  | { type: 'success'; kind: OperationKind; message?: string }
  | { type: 'error'; kind: OperationKind; message: string }
  | { type: 'conflicts' }
  | { type: 'clear' }
  | { type: 'branchStatusUpdated'; status: BranchStatus | null };

interface Options {
  successTimeoutMs?: number;
}

const initialState: OperationStatusState = {
  kind: null,
  phase: 'idle',
  sawRebaseInProgress: false,
};

function reducer(
  state: OperationStatusState,
  action: Action
): OperationStatusState {
  switch (action.type) {
    case 'start':
      return {
        kind: action.kind,
        phase: 'in-progress',
        message: action.message,
        sawRebaseInProgress: action.kind === 'rebase',
      };
    case 'success':
      return {
        kind: action.kind,
        phase: 'success',
        message: action.message,
        sawRebaseInProgress: false,
      };
    case 'error':
      return {
        kind: action.kind,
        phase: 'error',
        message: action.message,
        sawRebaseInProgress: false,
      };
    case 'conflicts':
      return {
        kind: 'rebase',
        phase: 'conflicts',
        sawRebaseInProgress: true,
      };
    case 'clear':
      return initialState;
    case 'branchStatusUpdated': {
      const status = action.status;
      if (!status) return state;

      // Conflicts present: show conflicts
      if ((status.conflicted_files?.length ?? 0) > 0) {
        return {
          kind: 'rebase',
          phase: 'conflicts',
          sawRebaseInProgress: true,
        };
      }

      // Rebase finished: was previously in progress and now cleared
      if (!status.is_rebase_in_progress && state.sawRebaseInProgress) {
        return {
          kind: 'rebase',
          phase: 'success',
          sawRebaseInProgress: false,
        };
      }

      // Track entry into rebase in-progress for background completion
      if (status.is_rebase_in_progress) {
        return {
          ...state,
          sawRebaseInProgress: true,
        };
      }

      // No meaningful change
      return state;
    }
    default:
      return state;
  }
}

export function useGitOperationStatus(options?: Options) {
  const successTimeoutMs = options?.successTimeoutMs ?? 4000;
  const [state, dispatch] = useReducer(reducer, initialState);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear success/error after timeout
  useEffect(() => {
    if (state.phase === 'success' || state.phase === 'error') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        dispatch({ type: 'clear' });
        timeoutRef.current = null;
      }, successTimeoutMs);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [state.phase, successTimeoutMs]);

  // Expose typed helpers
  const start = useCallback(
    (kind: OperationKind, message?: string) =>
      dispatch({ type: 'start', kind, message }),
    []
  );

  const success = useCallback(
    (kind: OperationKind, message?: string) =>
      dispatch({ type: 'success', kind, message }),
    []
  );

  const error = useCallback(
    (kind: OperationKind, message: string) =>
      dispatch({ type: 'error', kind, message }),
    []
  );

  const conflicts = useCallback(() => dispatch({ type: 'conflicts' }), []);

  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const branchStatusUpdated = useCallback(
    (status: BranchStatus | null) =>
      dispatch({ type: 'branchStatusUpdated', status }),
    []
  );

  return {
    state,
    start,
    success,
    error,
    conflicts,
    clear,
    branchStatusUpdated,
  };
}
