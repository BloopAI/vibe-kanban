import { useRebase } from './useRebase';
import { useMerge } from './useMerge';
import { usePush } from './usePush';
import { useForcePush } from './useForcePush';
import { useChangeTargetBranch } from './useChangeTargetBranch';
import { useGitOperationsError } from '@/contexts/GitOperationsContext';
import { Result } from '@/lib/api';
import type { GitOperationError } from 'shared/types';
import { ForcePushDialog } from '@/components/dialogs/git/ForcePushDialog';

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
    (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to merge';
      setError(message);
    }
  );

  const forcePush = useForcePush(
    attemptId,
    () => setError(null),
    (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to force push';
      setError(message);
    }
  );

  const push = usePush(
    attemptId,
    () => setError(null),
    async (err: unknown, errorData) => {
      // Handle typed push errors
      if (errorData?.type === 'force_push_required') {
        // Show confirmation dialog - dialog handles the force push internally
        if (attemptId) {
          await ForcePushDialog.show({ attemptId });
        }
        return;
      }

      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to push';
      setError(message);
    }
  );

  const changeTargetBranch = useChangeTargetBranch(
    attemptId,
    projectId,
    () => setError(null),
    (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to change target branch';
      setError(message);
    }
  );

  const isAnyLoading =
    rebase.isPending ||
    merge.isPending ||
    push.isPending ||
    forcePush.isPending ||
    changeTargetBranch.isPending;

  return {
    actions: {
      rebase: rebase.mutateAsync,
      merge: merge.mutateAsync,
      push: push.mutateAsync,
      forcePush: forcePush.mutateAsync,
      changeTargetBranch: changeTargetBranch.mutateAsync,
    },
    isAnyLoading,
    states: {
      rebasePending: rebase.isPending,
      mergePending: merge.isPending,
      pushPending: push.isPending,
      forcePushPending: forcePush.isPending,
      changeTargetBranchPending: changeTargetBranch.isPending,
    },
  };
}
