import { useEffect, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { cn } from '@/lib/utils';
import NewDisplayConversationEntry from './NewDisplayConversationEntry';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import type { WorkspaceWithSession } from '@/types/attempt';

interface ConversationListProps {
  attempt: WorkspaceWithSession;
}

export function ConversationList({ attempt }: ConversationListProps) {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const { setEntries, reset } = useEntries();
  const parentRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    setEntriesState([]);
    reset();
  }, [attempt.id, reset]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const onEntriesUpdated = useCallback(
    (
      newEntries: PatchTypeWithKey[],
      _addType: AddEntryType,
      newLoading: boolean
    ) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        setEntriesState(newEntries);
        setEntries(newEntries);
        if (newLoading === false) {
          setLoading(false);
        }
      }, 100);
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

  // Determine if content is ready to show (has data or finished loading)
  const hasContent = !loading || entries.length > 0;

  // Scroll to last item whenever entries change
  useEffect(() => {
    if (entries.length === 0) return;

    const scrollToEnd = () => {
      virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
    };

    // Immediate scroll
    scrollToEnd();

    // Keep trying every 50ms for up to 500ms until we're at the bottom
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
        className={cn(
          'h-full transition-opacity duration-300',
          hasContent ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div
          ref={parentRef}
          className="h-full overflow-auto scrollbar-none"
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
                    key={`conv-${data.patchKey}`}
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
                    key={`conv-${data.patchKey}`}
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
                    key={`conv-${data.patchKey}`}
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
                    <NewDisplayConversationEntry
                      expansionKey={data.patchKey}
                      entry={data.content}
                      executionProcessId={data.executionProcessId}
                      taskAttempt={attempt}
                    />
                  </div>
                );
              }

              return null;
            })}
          </div>
          <div className="h-2" />
        </div>
      </div>
    </ApprovalFormProvider>
  );
}

export default ConversationList;
