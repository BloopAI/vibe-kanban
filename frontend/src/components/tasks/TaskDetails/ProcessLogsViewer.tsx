import { useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle } from 'lucide-react';
import { useLogStream } from '@/hooks/useLogStream';
import RawLogText from '@/components/common/RawLogText';
import type { PatchType } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface ProcessLogsViewerProps {
  processId: string;
}

export function ProcessLogsViewerContent({
  logs,
  error,
}: {
  logs: LogEntry[];
  error: string | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const didInitScroll = useRef(false);
  const prevLenRef = useRef(0);

  // Native scroll to bottom - more reliable than virtualizer.scrollToIndex
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = parentRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  }, []);

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 10,
  });

  // Check if user is at bottom of scroll
  const isAtBottom = useCallback(() => {
    const el = parentRef.current;
    if (!el) return true;
    const threshold = 50;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Keep scroll position check for onScroll handler
  const checkAtBottom = useCallback(() => {
    // Just trigger the check - not stored in state anymore
    isAtBottom();
  }, [isAtBottom]);

  // 1) Initial jump to bottom once data appears.
  useEffect(() => {
    if (!didInitScroll.current && logs.length > 0) {
      didInitScroll.current = true;
      const doScroll = (attempts: number) => {
        scrollToBottom('auto');
        if (attempts > 0) {
          setTimeout(() => doScroll(attempts - 1), 100);
        }
      };
      setTimeout(() => doScroll(3), 50);
    }
  }, [logs.length, scrollToBottom]);

  // 2) If there's new logs and we're at bottom, scroll to bottom
  useEffect(() => {
    const prev = prevLenRef.current;
    const grewBy = logs.length - prev;
    prevLenRef.current = logs.length;

    if (grewBy > 0 && logs.length > 0 && didInitScroll.current) {
      setTimeout(() => {
        if (isAtBottom()) {
          scrollToBottom('smooth');
        }
      }, 50);
    }
  }, [logs.length, scrollToBottom, isAtBottom]);

  const formatLogLine = (entry: LogEntry, index: number) => {
    return (
      <RawLogText
        key={index}
        content={entry.content}
        channel={entry.type === 'STDERR' ? 'stderr' : 'stdout'}
        className="text-sm px-4 py-1"
      />
    );
  };

  return (
    <div className="h-full">
      {logs.length === 0 && !error ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          No logs available
        </div>
      ) : error ? (
        <div className="p-4 text-center text-destructive text-sm">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          {error}
        </div>
      ) : (
        <div
          ref={parentRef}
          className="flex-1 rounded-lg h-full overflow-auto"
          onScroll={checkAtBottom}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = logs[virtualRow.index];
              return (
                <div
                  key={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {formatLogLine(entry, virtualRow.index)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProcessLogsViewer({
  processId,
}: ProcessLogsViewerProps) {
  const { logs, error } = useLogStream(processId);
  return <ProcessLogsViewerContent logs={logs} error={error} />;
}
