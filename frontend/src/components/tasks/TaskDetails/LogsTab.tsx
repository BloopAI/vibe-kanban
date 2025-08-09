import { useContext, useState, useRef, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Cog } from 'lucide-react';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';
import { useProcessesLogs } from '@/hooks/useProcessesLogs';
import LogEntryRow from '@/components/logs/LogEntryRow';

function LogsTab() {
  const { attemptData } = useContext(TaskAttemptDataContext);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const virtuosoRef = useRef<any>(null);

  const { entries } = useProcessesLogs(attemptData.processes || [], true);

  // Memoized item content to prevent flickering
  const itemContent = useCallback(
    (index: number, entry: any) => <LogEntryRow entry={entry} index={index} />,
    []
  );

  // Handle when user manually scrolls away from bottom
  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setIsAtBottom(atBottom);
  }, []);

  if (!attemptData.processes || attemptData.processes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Cog className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No execution processes found for this attempt.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '100%' }}
        data={entries}
        itemContent={itemContent}
        followOutput={isAtBottom ? 'smooth' : false}
        atBottomStateChange={handleAtBottomStateChange}
        increaseViewportBy={200}
        overscan={5}
        components={{
          Footer: () => <div style={{ height: '50px' }} />,
        }}
      />
    </div>
  );
}

export default LogsTab;
