
import { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { VariableSizeList } from 'react-window';
import { Cog, Wifi, WifiOff } from 'lucide-react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const rowHeightCache = useRef<Map<number, number>>(new Map());

  const { entries, isConnected, errors } = useUnifiedLogs(
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
    if (!scrollUpdateWasRequested && containerRef.current) {
      const container = containerRef.current;
      const atBottom = container.scrollHeight - (scrollOffset + container.clientHeight) < 50;
      setAutoScroll(atBottom);
    }
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

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            {isConnected ? (
              <Wifi className="h-12 w-12 opacity-50" />
            ) : (
              <WifiOff className="h-12 w-12 opacity-50" />
            )}
          </div>
          <p>
            {isConnected ? 'Waiting for log entries...' : 'Connecting to log streams...'}
          </p>
          {errors.size > 0 && (
            <div className="mt-4 text-red-500">
              <p>Connection errors:</p>
              <ul className="text-sm mt-2">
                {Array.from(errors.entries()).map(([processId, error]) => (
                  <li key={processId}>Process {processId}: {error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Connection status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b text-sm">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-green-700">Connected to {attemptData.processes.length} processes</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-red-500" />
              <span className="text-red-700">Disconnected</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-600">{entries.length} entries</span>
          {!autoScroll && (
            <button
              onClick={() => setAutoScroll(true)}
              className="text-blue-600 hover:text-blue-800"
            >
              Scroll to bottom
            </button>
          )}
        </div>
      </div>

      {/* Virtualized log entries */}
      <div ref={containerRef} className="flex-1">
        <VariableSizeList
          ref={listRef}
          height={containerRef.current?.clientHeight || 400}
          width={containerRef.current?.clientWidth || 800}
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
      </div>
    </div>
  );
}

export default LogsTab;
