import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useEffect, useMemo, useRef, useState } from 'react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: TaskAttempt;
  task?: TaskWithAttemptStatus;
}

interface MessageListContext {
  attempt: TaskAttempt;
  task?: TaskWithAttemptStatus;
}

const ItemContent = ({
  data,
  context,
}: {
  data: PatchTypeWithKey;
  context?: MessageListContext;
}) => {
  const attempt = context?.attempt;
  const task = context?.task;

  if (data.type === 'STDOUT') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'STDERR') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'NORMALIZED_ENTRY' && attempt) {
    return (
      <DisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        task={task}
      />
    );
  }

  return null;
};

const computeItemKey = (_index: number, data: PatchTypeWithKey) =>
  `l-${data.patchKey}`;

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const [items, setItems] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const { setEntries, reset } = useEntries();

  useEffect(() => {
    setLoading(true);
    setItems([]);
    reset();
  }, [attempt.id, reset]);

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    _addType: AddEntryType,
    newLoading: boolean
  ) => {
    setItems(newEntries);
    setEntries(newEntries);

    if (loading) {
      setLoading(newLoading);
    }
  };

  useConversationHistory({ attempt, onEntriesUpdated });

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const didInitScroll = useRef(false);
  const prevLenRef = useRef(0);
  const messageListContext = useMemo(
    () => ({ attempt, task }),
    [attempt, task]
  );

  // Initial jump to bottom once data appears
  useEffect(() => {
    if (!didInitScroll.current && items.length > 0) {
      didInitScroll.current = true;
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: items.length - 1,
          align: 'end',
        });
      });
    }
  }, [items.length]);

  // Handle large bursts - force scroll to bottom
  useEffect(() => {
    const prev = prevLenRef.current;
    const grewBy = items.length - prev;
    prevLenRef.current = items.length;

    const LARGE_BURST = 10;
    if (grewBy >= LARGE_BURST && atBottom && items.length > 0) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: items.length - 1,
          align: 'end',
        });
      });
    }
  }, [items.length, atBottom, items]);

  return (
    <ApprovalFormProvider>
      <Virtuoso<PatchTypeWithKey>
        ref={virtuosoRef}
        className="flex-1"
        data={items}
        itemContent={(_index, item) => (
          <ItemContent data={item} context={messageListContext} />
        )}
        computeItemKey={computeItemKey}
        components={{
          Header: () => <div className="h-2"></div>,
          Footer: () => <div className="h-2"></div>,
        }}
        initialTopMostItemIndex={items.length > 0 ? items.length - 1 : 0}
        atBottomStateChange={setAtBottom}
        followOutput={atBottom && !loading ? 'smooth' : false}
        increaseViewportBy={{ top: 0, bottom: 600 }}
      />
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
