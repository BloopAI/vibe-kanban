
import { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { VariableSizeList } from 'react-window';
import { Cog } from 'lucide-react';
import useMeasure from 'react-use-measure';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';
import { useProcessesLogs } from '@/hooks/useProcessesLogs';
import LogEntryRow from '@/components/logs/LogEntryRow';
import type { UnifiedLogEntry } from '@/types/logs';

function LogsTab() {
  const { attemptData } = useContext(TaskAttemptDataContext);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<VariableSizeList>(null);
  const [containerRef, bounds] = useMeasure();

  const { entries } = useProcessesLogs(
    attemptData.processes || [],
    true
  );

  const rowHeights = useRef<Record<number, number>>({});

  const getRowHeight = useCallback((index: number): number => {
    const h = rowHeights.current[index];
    return h !== undefined ? h : 100;
  }, []);

  const setRowHeight = useCallback((index: number, size: number) => {
    listRef.current?.resetAfterIndex(0);
    rowHeights.current = { ...rowHeights.current, [index]: size };
  }, []);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && entries.length > 0 && listRef.current) {
      listRef.current.scrollToItem(entries.length - 1, 'end');
    }
  }, [entries.length, autoScroll]);

  // Handle scroll events to detect user scrolling
  const onScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: any) => {
    if (!scrollUpdateWasRequested && bounds.height) {
      const atBottom = bounds.height - (scrollOffset + bounds.height) < 50;
      setAutoScroll(atBottom);
    }
  }, [bounds.height]);

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
    <div ref={containerRef} className="w-full h-full">
      {bounds.height && bounds.width &&
        <VariableSizeList
          ref={listRef}
          height={bounds.height}
          width={bounds.width}
          itemCount={entries.length}
          itemSize={getRowHeight}
          onScroll={onScroll}
          itemData={entries}
        >
          {({ index, style, data }: { index: number; style: React.CSSProperties; data: UnifiedLogEntry[] }) => (
            <LogEntryRow
              entry={data[index]}
              index={index}
              style={style}
              setRowHeight={setRowHeight}
            />
          )}
        </VariableSizeList>
      }
    </div>
  );
}

export default LogsTab;
