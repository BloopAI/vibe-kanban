import type { TaskAttempt } from 'shared/types';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { RetryUiProvider } from '@/contexts/RetryUiContext';

interface AttemptLogsPaneProps {
  attempt: TaskAttempt;
}

export const AttemptLogsPane = ({ attempt }: AttemptLogsPaneProps) => {
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
      <ReviewProvider>
        <ClickedElementsProvider attempt={attempt}>
          <EntriesProvider key={attempt.id}>
            <RetryUiProvider attemptId={attempt.id}>
              <VirtualizedList key={attempt.id} attempt={attempt} />
            </RetryUiProvider>
          </EntriesProvider>
        </ClickedElementsProvider>
      </ReviewProvider>
    </div>
  );
};
