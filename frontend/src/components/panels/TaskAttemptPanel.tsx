import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { TaskRelationshipViewer } from '@/components/tasks/TaskRelationshipViewer';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { PlanReviewPanel } from '@/components/plans';
import { usePlanSteps } from '@/hooks';
import type { ReactNode } from 'react';

interface TaskAttemptPanelProps {
  attempt: TaskAttempt | undefined;
  task: TaskWithAttemptStatus | null;
  children: (sections: {
    logs: ReactNode;
    followUp: ReactNode;
    planSteps: ReactNode;
    relationships: ReactNode;
  }) => ReactNode;
  onCreateSubtasks?: () => void;
  onNavigateToTask?: (taskId: string) => void;
  tasksById?: Record<string, TaskWithAttemptStatus>;
}

const TaskAttemptPanel = ({
  attempt,
  task,
  children,
  onCreateSubtasks,
  onNavigateToTask,
  tasksById,
}: TaskAttemptPanelProps) => {
  // Fetch plan steps for the current attempt
  const { data: planSteps = [] } = usePlanSteps(attempt?.id);
  const hasPlanSteps = planSteps.length > 0;

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
            <TaskFollowUpSection
              task={task}
              selectedAttemptId={attempt.id}
              jumpToLogsTab={() => {}}
            />
          ),
          planSteps: hasPlanSteps ? (
            <div className="p-4">
              <PlanReviewPanel
                attemptId={attempt.id}
                onCreateSubtasks={onCreateSubtasks}
              />
            </div>
          ) : null,
          relationships: (
            <TaskRelationshipViewer
              selectedAttempt={attempt}
              onNavigateToTask={onNavigateToTask}
              task={task}
              tasksById={tasksById}
            />
          ),
        })}
      </RetryUiProvider>
    </EntriesProvider>
  );
};

export default TaskAttemptPanel;
