import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import type { ReactNode } from 'react';

interface TaskAttemptPanelProps {
  attempt: TaskAttempt | undefined;
  task: TaskWithAttemptStatus | null;
  children: (sections: { logs: ReactNode; followUp: ReactNode }) => ReactNode;
}

const TaskAttemptPanel = ({
  attempt,
  task,
  children,
}: TaskAttemptPanelProps) => {
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
            <VirtualizedList key={attempt.id} attempt={attempt} task={task} />
          ),
          followUp: (
            <TaskFollowUpSection task={task} selectedAttemptId={attempt.id} />
          ),
        })}
      </RetryUiProvider>
    </EntriesProvider>
  );
};

export default TaskAttemptPanel;
