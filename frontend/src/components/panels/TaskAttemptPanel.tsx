import type { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import type { ReactNode } from 'react';
import GitOperations from '@/components/tasks/Toolbar/GitOperations';
import { useBranchStatus, useAttemptExecution } from '@/hooks';

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
              {branchStatus && (
                <div className="px-3">
                  <GitOperations
                    selectedAttempt={attempt}
                    task={task}
                    branchStatus={branchStatus}
                    isAttemptRunning={isAttemptRunning}
                    selectedBranch={branchStatus[0]?.target_branch_name ?? null}
                    layout="horizontal"
                  />
                </div>
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
