import {
  DataWithScrollModifier,
  ScrollModifier,
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListMethods,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import { useEffect, useMemo, useRef, useState } from 'react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskAttempt } from 'shared/types';

interface VirtualizedListProps {
  attempt: TaskAttempt;
}

interface MessageListContext {
  attempt: TaskAttempt;
  items: PatchTypeWithKey[];
  lastMeaningfulIndex: number | null;
}

const INITIAL_TOP_ITEM = { index: 'LAST' as const, align: 'end' as const };

const InitialDataScrollModifier: ScrollModifier = {
  type: 'item-location',
  location: INITIAL_TOP_ITEM,
  purgeItemSizes: true,
};

const AutoScrollToBottom: ScrollModifier = {
  type: 'auto-scroll-to-bottom',
  autoScroll: 'smooth',
};

const isLoadingEntry = (item: PatchTypeWithKey) =>
  item.type === 'NORMALIZED_ENTRY' &&
  item.content.entry_type?.type === 'loading';

const findPreviousMeaningfulIndex = (
  items: PatchTypeWithKey[],
  startIndex: number,
  options: { normalizedOnly?: boolean } = {}
) => {
  const { normalizedOnly = false } = options;

  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const candidate = items[i];
    if (normalizedOnly && candidate.type !== 'NORMALIZED_ENTRY') continue;
    if (isLoadingEntry(candidate)) continue;

    return i;
  }

  return null;
};

const getLastMeaningfulIndex = (items: PatchTypeWithKey[]) => {
  const index = findPreviousMeaningfulIndex(items, items.length);
  if (index !== null) {
    return index;
  }

  return items.length > 0 ? items.length - 1 : null;
};

const ItemContent: VirtuosoMessageListProps<
  PatchTypeWithKey,
  MessageListContext
>['ItemContent'] = ({ data, index, context }) => {
  const items = context?.items ?? [];
  const attempt = context?.attempt;
  const lastMeaningfulIndex = context?.lastMeaningfulIndex ?? null;

  if (data.type === 'STDOUT') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'STDERR') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'NORMALIZED_ENTRY' && attempt) {
    const entryType = data.content.entry_type;

    if (entryType?.type === 'loading') {
      const previousIndex = findPreviousMeaningfulIndex(items, index, {
        normalizedOnly: true,
      });
      const previous =
        previousIndex === null ? null : (items[previousIndex] ?? null);

      if (
        previous?.type === 'NORMALIZED_ENTRY' &&
        previous.content.entry_type?.type === 'tool_use' &&
        previous.content.entry_type.status?.status === 'pending_approval'
      ) {
        return null;
      }
    }

    return (
      <DisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        lastEntry={lastMeaningfulIndex !== null && index === lastMeaningfulIndex}
      />
    );
  }

  return null;
};

const computeItemKey: VirtuosoMessageListProps<
  PatchTypeWithKey,
  MessageListContext
>['computeItemKey'] = ({ data }) => `l-${data.patchKey}`;

const VirtualizedList = ({ attempt }: VirtualizedListProps) => {
  const [channelData, setChannelData] =
    useState<DataWithScrollModifier<PatchTypeWithKey> | null>(null);
  const [loading, setLoading] = useState(true);
  const { setEntries, reset } = useEntries();

  const lastMeaningfulIndex = useMemo<number | null>(() => {
    const items = channelData?.data ?? [];
    if (items.length === 0) {
      return null;
    }

    return getLastMeaningfulIndex(items);
  }, [channelData]);

  useEffect(() => {
    setLoading(true);
    setChannelData(null);
    reset();
  }, [attempt.id, reset]);

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType,
    newLoading: boolean
  ) => {
    let scrollModifier: ScrollModifier = InitialDataScrollModifier;

    if (addType === 'running' && !loading) {
      scrollModifier = AutoScrollToBottom;
    }

    setChannelData({ data: newEntries, scrollModifier });
    setEntries(newEntries);

    if (loading) {
      setLoading(newLoading);
    }
  };

  useConversationHistory({ attempt, onEntriesUpdated });

  const messageListRef = useRef<VirtuosoMessageListMethods | null>(null);
  const items = channelData?.data ?? [];
  const messageListContext = useMemo(
    () => ({ attempt, items, lastMeaningfulIndex }),
    [attempt, items, lastMeaningfulIndex]
  );

  return (
    <>
      <VirtuosoMessageListLicense
        licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
      >
        <VirtuosoMessageList<PatchTypeWithKey, MessageListContext>
          ref={messageListRef}
          className="flex-1"
          data={channelData}
          initialLocation={INITIAL_TOP_ITEM}
          context={messageListContext}
          computeItemKey={computeItemKey}
          ItemContent={ItemContent}
          Header={() => <div className="h-2"></div>}
          Footer={() => <div className="h-2"></div>}
        />
      </VirtuosoMessageListLicense>
      {loading && (
        <div className="float-left top-0 left-0 w-full h-full bg-primary flex flex-col gap-2 justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
    </>
  );
};

export default VirtualizedList;
