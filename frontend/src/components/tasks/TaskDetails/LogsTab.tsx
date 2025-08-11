import { useContext, useState, useRef, useCallback, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Cog } from 'lucide-react';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';
import { useProcessesLogs } from '@/hooks/useProcessesLogs';
import LogEntryRow from '@/components/logs/LogEntryRow';

function LogsTab() {
  const { attemptData } = useContext(TaskAttemptDataContext);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [collapsedProcesses, setCollapsedProcesses] = useState<Set<string>>(
    new Set()
  );
  const virtuosoRef = useRef<any>(null);

  const { entries } = useProcessesLogs(attemptData.processes || [], true);

  // Toggle collapsed state for a process
  const toggleProcessCollapse = useCallback(
    (processId: string) => {
      const wasAtBottom = isAtBottom;
      setCollapsedProcesses((prev) => {
        const next = new Set(prev);
        if (next.has(processId)) {
          next.delete(processId);
        } else {
          next.add(processId);
        }
        return next;
      });

      // If user was at bottom, scroll to new bottom after state update
      if (wasAtBottom) {
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({
            index: 'LAST',
            align: 'end',
            behavior: 'auto',
          });
        }, 0);
      }
    },
    [isAtBottom]
  );

  // Filter entries to hide logs from collapsed processes
  const visibleEntries = useMemo(() => {
    return entries.filter((entry) =>
      entry.channel === 'process_start'
        ? true
        : !collapsedProcesses.has(entry.processId)
    );
  }, [entries, collapsedProcesses]);

  // Memoized item content to prevent flickering
  const itemContent = useCallback(
    (index: number, entry: any) => (
      <LogEntryRow
        entry={entry}
        index={index}
        isCollapsed={
          entry.channel === 'process_start'
            ? collapsedProcesses.has(entry.payload.processId)
            : undefined
        }
        onToggleCollapse={
          entry.channel === 'process_start' ? toggleProcessCollapse : undefined
        }
      />
    ),
    [collapsedProcesses, toggleProcessCollapse]
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
        data={visibleEntries}
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
