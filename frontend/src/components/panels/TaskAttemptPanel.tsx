import type { TaskWithAttemptStatus, RepoBranchStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import type { ReactNode } from 'react';
import { BranchStatusInfo } from '@/components/tasks/BranchStatusInfo';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useCallback } from 'react';
import { ChangeTargetBranchDialog } from '@/components/dialogs/tasks/ChangeTargetBranchDialog';
import { useGitOperations } from '@/hooks/useGitOperations';
import { useRepoBranches } from '@/hooks';

interface TaskAttemptPanelProps {
  attempt: WorkspaceWithSession | undefined;
  task: TaskWithAttemptStatus | null;
  branchStatus: RepoBranchStatus[] | null;
  isAttemptRunning: boolean;
  children: (sections: { logs: ReactNode; followUp: ReactNode }) => ReactNode;
}

const TaskAttemptPanel = ({
  attempt,
  task,
  branchStatus,
  isAttemptRunning,
  children,
}: TaskAttemptPanelProps) => {
  const { repos, selectedRepoId, setSelectedRepoId } = useAttemptRepo(
    attempt?.id
  );
  const git = useGitOperations(
    attempt?.id ?? '',
    selectedRepoId ?? undefined
  );
  const { data: branches = [] } = useRepoBranches(selectedRepoId);
  const isChangingTargetBranch = git.states.changeTargetBranchPending;

  const getSelectedRepoId = useCallback(() => {
    return selectedRepoId ?? repos[0]?.id;
  }, [selectedRepoId, repos]);

  const getSelectedRepoStatus = useCallback(() => {
    const repoId = getSelectedRepoId();
    return branchStatus?.find((r) => r.repo_id === repoId) ?? null;
  }, [branchStatus, getSelectedRepoId]);

  const handleChangeTargetBranchClick = async (newBranch: string) => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;
    await git.actions.changeTargetBranch({
      newTargetBranch: newBranch,
      repoId,
    });
  };

  const handleChangeTargetBranchDialogOpen = async () => {
    try {
      const result = await ChangeTargetBranchDialog.show({
        branches,
        isChangingTargetBranch: isChangingTargetBranch,
      });

      if (result.action === 'confirmed' && result.branchName) {
        await handleChangeTargetBranchClick(result.branchName);
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  if (!attempt) {
    return <div className="p-6 text-muted-foreground">Loading attempt...</div>;
  }

  if (!task) {
    return <div className="p-6 text-muted-foreground">Loading task...</div>;
  }

  const selectedRepoStatus = getSelectedRepoStatus();
  const hasConflicts = (selectedRepoStatus?.conflicted_files?.length ?? 0) > 0;

  return (
    <EntriesProvider key={attempt.id}>
      <RetryUiProvider attemptId={attempt.id}>
        {children({
          logs: (
            <>
              {selectedRepoStatus && (
                <BranchStatusInfo
                  selectedAttempt={attempt}
                  branchStatus={branchStatus}
                  selectedRepoStatus={selectedRepoStatus}
                  isAttemptRunning={isAttemptRunning}
                  selectedBranch={selectedRepoStatus.target_branch_name}
                  layout="compact"
                  repos={repos}
                  selectedRepoId={selectedRepoId}
                  onRepoSelect={setSelectedRepoId}
                  onChangeTargetBranch={handleChangeTargetBranchDialogOpen}
                  hasConflicts={hasConflicts}
                />
              )}
              <VirtualizedList
                key={attempt.id}
                attempt={attempt}
                task={task}
              />
            </>
          ),
          followUp: (
            <TaskFollowUpSection task={task} session={attempt.session} />
          ),
        })}
      </RetryUiProvider>
    </EntriesProvider>
  );
};

export default TaskAttemptPanel;
