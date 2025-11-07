import { useRebase } from './useRebase';
import { useMerge } from './useMerge';
import { usePush } from './usePush';
import { useChangeTargetBranch } from './useChangeTargetBranch';
import { useGitOperationsError } from '@/contexts/GitOperationsContext';
import { Result } from '@/lib/api';
import type { GitOperationError } from 'shared/types';

export function useGitOperations(
  attemptId: string | undefined,
  projectId: string | undefined
) {
  const { setError } = useGitOperationsError();

  const rebase = useRebase(
    attemptId,
    projectId,
    () => setError(null),
    (err: Result<void, GitOperationError>) => {
      if (!err.success) {
        const data = err?.error;
        const isConflict =
          data?.type === 'merge_conflicts' ||
          data?.type === 'rebase_in_progress';
        if (!isConflict) {
          setError(err.message || 'Failed to rebase');
        }
      }
    }
  );

  const merge = useMerge(
    attemptId,
    () => setError(null),
    (err: any) => {
      setError(err?.message || 'Failed to merge');
    }
  );

  const push = usePush(
    attemptId,
    () => setError(null),
    (err: any) => {
      setError(err?.message || 'Failed to push');
    }
  );

  const changeTargetBranch = useChangeTargetBranch(
    attemptId,
    projectId,
    () => setError(null),
    (err: any) => {
      setError(err?.message || 'Failed to change target branch');
    }
  );

  const isAnyLoading =
    rebase.isPending ||
    merge.isPending ||
    push.isPending ||
    changeTargetBranch.isPending;

  return {
    actions: {
      rebase: rebase.mutateAsync,
      merge: merge.mutateAsync,
      push: push.mutateAsync,
      changeTargetBranch: changeTargetBranch.mutateAsync,
    },
    isAnyLoading,
    states: {
      rebasePending: rebase.isPending,
      mergePending: merge.isPending,
      pushPending: push.isPending,
      changeTargetBranchPending: changeTargetBranch.isPending,
    },
  };
}
