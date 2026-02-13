import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/ssr';
import RawLogText from '@/components/common/RawLogText';
import type { PatchType } from 'shared/types';

export type LogEntry = Extract<
  PatchType,
  { type: 'STDOUT' } | { type: 'STDERR' }
>;

export interface VirtualizedProcessLogsProps {
  logs: LogEntry[];
  error: string | null;
  searchQuery: string;
  matchIndices: number[];
  currentMatchIndex: number;
}

export function VirtualizedProcessLogs({
  logs,
  error,
  searchQuery,
  matchIndices,
  currentMatchIndex,
}: VirtualizedProcessLogsProps) {
  const { t } = useTranslation('tasks');
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const didInitScroll = useRef(false);
  const prevLenRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  // Initial jump to bottom once data appears
  useEffect(() => {
    if (!didInitScroll.current && logs.length > 0) {
      didInitScroll.current = true;
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: logs.length - 1,
          align: 'end',
        });
      });
    }
  }, [logs.length]);

  // Handle large bursts: force-stick to last item
  useEffect(() => {
    const prev = prevLenRef.current;
    const grewBy = logs.length - prev;
    prevLenRef.current = logs.length;

    const LARGE_BURST = 10;
    if (grewBy >= LARGE_BURST && atBottom && logs.length > 0) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: logs.length - 1,
          align: 'end',
        });
      });
    }
  }, [logs.length, atBottom, logs]);

  // Scroll to current search match when it changes
  useEffect(() => {
    if (matchIndices.length > 0 && currentMatchIndex >= 0) {
      const logIndex = matchIndices[currentMatchIndex];
      if (logIndex !== undefined) {
        virtuosoRef.current?.scrollToIndex({
          index: logIndex,
          align: 'center',
          behavior: 'smooth',
        });
      }
    }
  }, [currentMatchIndex, matchIndices]);

  if (logs.length === 0 && !error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-center text-muted-foreground text-sm">
          {t('processes.noLogsAvailable')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-center text-destructive text-sm">
          <WarningCircleIcon className="size-icon-base inline mr-2" />
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <Virtuoso<LogEntry>
        ref={virtuosoRef}
        className="h-full"
        data={logs}
        itemContent={(index, entry) => {
          const isMatch = matchIndices.includes(index);
          const isCurrentMatch =
            matchIndices[currentMatchIndex] === index;

          return (
            <RawLogText
              content={entry.content}
              channel={entry.type === 'STDERR' ? 'stderr' : 'stdout'}
              className="text-sm px-4 py-1"
              linkifyUrls
              searchQuery={isMatch ? searchQuery : undefined}
              isCurrentMatch={isCurrentMatch}
            />
          );
        }}
        atBottomStateChange={setAtBottom}
        followOutput={atBottom ? 'smooth' : false}
        increaseViewportBy={{ top: 0, bottom: 600 }}
      />
    </div>
  );
}
