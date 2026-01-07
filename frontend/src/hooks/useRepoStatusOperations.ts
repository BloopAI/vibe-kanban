import { useCallback, useMemo } from 'react';
import type { RepoBranchStatus } from 'shared/types';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useGitOperations } from '@/hooks/useGitOperations';
import { useRepoBranches } from '@/hooks';
import { ChangeTargetBranchDialog } from '@/components/dialogs/tasks/ChangeTargetBranchDialog';
import { useGitOperationsError } from '@/contexts/GitOperationsContext';

/**
 * custom hook que encapsula toda la lógica relacionada con el estado de repositorios
 * y operaciones git para evitar duplicación entre componentes
 */
export function useRepoStatusOperations(
  attemptId: string | undefined,
  branchStatus: RepoBranchStatus[] | null | undefined
) {
  const { setError } = useGitOperationsError();
  const { repos, selectedRepoId, setSelectedRepoId } = useAttemptRepo(attemptId);
  const git = useGitOperations(attemptId ?? '', selectedRepoId ?? undefined);
  const { data: branches = [] } = useRepoBranches(selectedRepoId);

  const getSelectedRepoId = useCallback(() => {
    return selectedRepoId ?? repos[0]?.id;
  }, [selectedRepoId, repos]);

  const getSelectedRepoStatus = useCallback(() => {
    const repoId = getSelectedRepoId();
    return branchStatus?.find((r) => r.repo_id === repoId) ?? null;
  }, [branchStatus, getSelectedRepoId]);

  const selectedRepoStatus = useMemo(
    () => getSelectedRepoStatus(),
    [getSelectedRepoStatus]
  );

  const hasConflicts = useMemo(
    () => (selectedRepoStatus?.conflicted_files?.length ?? 0) > 0,
    [selectedRepoStatus]
  );

  const handleChangeTargetBranchClick = useCallback(
    async (newBranch: string) => {
      const repoId = getSelectedRepoId();
      if (!repoId) {
        setError('No repository selected');
        return;
      }

      try {
        await git.actions.changeTargetBranch({
          newTargetBranch: newBranch,
          repoId,
        });
        // clear any previous errors on success
        setError(null);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to change target branch'
        );
      }
    },
    [getSelectedRepoId, git.actions, setError]
  );

  const handleChangeTargetBranchDialogOpen = useCallback(async () => {
    try {
      const result = await ChangeTargetBranchDialog.show({
        branches,
        isChangingTargetBranch: git.states.changeTargetBranchPending,
      });

      if (result.action === 'confirmed' && result.branchName) {
        await handleChangeTargetBranchClick(result.branchName);
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  }, [branches, git.states.changeTargetBranchPending, handleChangeTargetBranchClick]);

  return {
    repos,
    selectedRepoId,
    setSelectedRepoId,
    selectedRepoStatus,
    hasConflicts,
    getSelectedRepoId,
    getSelectedRepoStatus,
    handleChangeTargetBranchDialogOpen,
    git,
    branches,
  };
}
