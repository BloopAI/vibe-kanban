
import { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { VariableSizeList } from 'react-window';
import { Cog } from 'lucide-react';
import useMeasure from 'react-use-measure';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';
import { useUnifiedLogs } from '@/hooks/useUnifiedLogs';
import LogEntryRow from '@/components/logs/LogEntryRow';
import type { UnifiedLogEntry } from '@/types/logs';

// Fixed height for simple log entries, variable for normalized conversation entries
const FIXED_ROW_HEIGHT = 24;
const ESTIMATED_ROW_HEIGHT = 100;

function LogsTab() {
  const { attemptData } = useContext(TaskAttemptDataContext);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<VariableSizeList>(null);
  const [containerRef, bounds] = useMeasure();
  const rowHeightCache = useRef<Map<number, number>>(new Map());

  const { entries } = useUnifiedLogs(
    attemptData.processes || [],
    true
  );

  // Get item size for react-window
  const getItemSize = useCallback((index: number): number => {
    const cached = rowHeightCache.current.get(index);
    if (cached) return cached;

    const entry = entries[index];
    if (!entry) return ESTIMATED_ROW_HEIGHT;

    // Raw logs have fixed height, normalized entries are variable
    const height = entry.channel === 'normalized' ? ESTIMATED_ROW_HEIGHT : FIXED_ROW_HEIGHT;
    rowHeightCache.current.set(index, height);
    return height;
  }, [entries]);

  // Clear cache when entries change significantly
  useEffect(() => {
    rowHeightCache.current.clear();
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [entries.length]);

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
          itemSize={getItemSize}
          onScroll={onScroll}
          itemData={entries}
        >
          {({ index, style, data }: { index: number; style: React.CSSProperties; data: UnifiedLogEntry[] }) => (
            <LogEntryRow
              entry={data[index]}
              index={index}
              style={style}
            />
          )}
        </VariableSizeList>
      }
    </div>
  );
}

export default LogsTab;
