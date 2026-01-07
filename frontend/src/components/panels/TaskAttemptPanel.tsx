import type { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import type { ReactNode } from 'react';
import { BranchStatusInfo } from '@/components/tasks/BranchStatusInfo';
import { useBranchStatus, useAttemptExecution } from '@/hooks';
import { useRepoStatusOperations } from '@/hooks/useRepoStatusOperations';

interface TaskAttemptPanelProps {
  attempt: WorkspaceWithSession | undefined;
  task: TaskWithAttemptStatus | null;
  children: (sections: { logs: ReactNode; followUp: ReactNode }) => ReactNode;
}

const TaskAttemptPanel = ({
  attempt,
  task,
  children,
}: TaskAttemptPanelProps) => {
  // fetch all data internally for self-contained component
  const { data: branchStatus } = useBranchStatus(attempt?.id);
  const { isAttemptRunning } = useAttemptExecution(attempt?.id);

  // use custom hook for repo status operations
  const {
    repos,
    selectedRepoId,
    setSelectedRepoId,
    selectedRepoStatus,
    hasConflicts,
    handleChangeTargetBranchDialogOpen,
  } = useRepoStatusOperations(attempt?.id, branchStatus);

  if (!attempt) {
    return <div className="p-6 text-muted-foreground">Loading attempt...</div>;
  }

  if (!task) {
    return <div className="p-6 text-muted-foreground">Loading task...</div>;
  }

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
