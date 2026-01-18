import { useEffect, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const { setEntries, reset } = useEntries();
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setEntriesState([]);
    reset();
  }, [attempt.id, reset]);

  const onEntriesUpdated = useCallback(
    (
      newEntries: PatchTypeWithKey[],
      _addType: AddEntryType,
      newLoading: boolean
    ) => {
      setEntriesState(newEntries);
      setEntries(newEntries);
      if (newLoading === false) {
        setLoading(false);
      }
    },
    [setEntries]
  );

  useConversationHistory({ attempt, onEntriesUpdated });

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  // Scroll to last item whenever entries change
  useEffect(() => {
    if (entries.length === 0) return;

    const scrollToEnd = () => {
      virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
    };

    scrollToEnd();

    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 50;
      const el = parentRef.current;
      const atBottom = el
        ? el.scrollHeight - el.scrollTop - el.clientHeight < 50
        : false;

      if (atBottom || elapsed >= 500) {
        clearInterval(interval);
      } else {
        scrollToEnd();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [entries.length, virtualizer]);

  return (
    <ApprovalFormProvider>
      <div
        ref={parentRef}
        className="flex-1 h-full overflow-auto"
      >
        <div className="h-2" />
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const data = entries[virtualRow.index];
            if (!data) return null;

            if (data.type === 'STDOUT') {
              return (
                <div
                  key={`l-${data.patchKey}`}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <p>{data.content}</p>
                </div>
              );
            }
            if (data.type === 'STDERR') {
              return (
                <div
                  key={`l-${data.patchKey}`}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <p>{data.content}</p>
                </div>
              );
            }
            if (data.type === 'NORMALIZED_ENTRY') {
              return (
                <div
                  key={`l-${data.patchKey}`}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <DisplayConversationEntry
                    expansionKey={data.patchKey}
                    entry={data.content}
                    executionProcessId={data.executionProcessId}
                    taskAttempt={attempt}
                    task={task}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
        <div className="h-2" />
      </div>
      {loading && (
        <div className="float-left top-0 left-0 w-full h-full bg-primary flex flex-col gap-2 justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
