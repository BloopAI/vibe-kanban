import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { NewCardContent } from '../ui/new-card';

interface TaskAttemptPanelProps {
  attempt: TaskAttempt | undefined;
  task: TaskWithAttemptStatus | null;
}

const TaskAttemptPanel = ({ attempt, task }: TaskAttemptPanelProps) => {
  if (!attempt) {
    return <div className="p-6 text-muted-foreground">Loading attempt...</div>;
  }

  if (!task) {
    return <div className="p-6 text-muted-foreground">Loading task...</div>;
  }

  return (
    <NewCardContent className="flex-1 min-h-0 min-w-0 flex flex-col">
      <ReviewProvider>
        <ClickedElementsProvider attempt={attempt}>
          <EntriesProvider key={attempt.id}>
            <RetryUiProvider attemptId={attempt.id}>
              <VirtualizedList key={attempt.id} attempt={attempt} />
              <TaskFollowUpSection
                task={task}
                selectedAttemptId={attempt.id}
                jumpToLogsTab={() => {}}
              />
            </RetryUiProvider>
          </EntriesProvider>
        </ClickedElementsProvider>
      </ReviewProvider>
    </NewCardContent>
  );
};

export default TaskAttemptPanel;
