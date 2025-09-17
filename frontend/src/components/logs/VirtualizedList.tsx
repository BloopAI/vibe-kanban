import {
  DataWithScrollModifier,
  ScrollModifier,
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListMethods,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import { useEffect, useRef, useState } from 'react';
import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { TaskAttempt } from 'shared/types';
import { Loader2 } from 'lucide-react';

interface VirtualizedListProps {
  attempt: TaskAttempt;
}

interface MessageListContext {
  attempt: TaskAttempt;
}

type ChannelData = DataWithScrollModifier<PatchTypeWithKey> | null;

const InitialDataScrollModifier: ScrollModifier = {
  type: 'item-location',
  location: {
    index: 'LAST',
    align: 'end',
  },
  purgeItemSizes: true,
};

const AutoScrollToBottom: ScrollModifier = {
  type: 'auto-scroll-to-bottom',
  autoScroll: ({ atBottom, scrollInProgress }) => {
    if (atBottom || scrollInProgress) {
      return 'smooth';
    }
    return false;
  },
};

const ItemContent: VirtuosoMessageListProps<
  PatchTypeWithKey,
  MessageListContext
>['ItemContent'] = ({ data, context }) => {
  if (data.type === 'STDOUT') {
    return <p>{data.content}</p>;
  } else if (data.type === 'STDERR') {
    return <p>{data.content}</p>;
  } else if (data.type === 'NORMALIZED_ENTRY') {
    return (
      <DisplayConversationEntry
        key={data.patchKey}
        expansionKey={data.patchKey}
        entry={data.content}
        executionProcessId={data.executionProcessId}
        taskAttempt={context.attempt}
      />
    );
  }
};

const VirtualizedList = ({ attempt }: VirtualizedListProps) => {
  const [channelData, setChannelData] = useState<ChannelData>(null);
  const [loading, setLoading] = useState(true);
  const { setEntries, reset } = useEntries();

  // When attempt changes, set loading and reset entries
  useEffect(() => {
    setLoading(true);
    reset();
  }, [attempt.id, reset]);

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType,
    newLoading: boolean
  ) => {
    // initial defaults to scrolling to the latest
    let scrollModifier: ScrollModifier = InitialDataScrollModifier;

    if (addType === 'running' && !loading) {
      scrollModifier = AutoScrollToBottom;
    }

    setChannelData({ data: newEntries, scrollModifier });
    setEntries(newEntries); // Update shared context
    if (loading) {
      setLoading(newLoading);
    }
  };
  useConversationHistory({ attempt, onEntriesUpdated });

  const messageListRef = useRef<VirtuosoMessageListMethods | null>(null);

  return (
    <>
      <VirtuosoMessageListLicense
        licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
      >
        <VirtuosoMessageList<PatchTypeWithKey, MessageListContext>
          ref={messageListRef}
          className="flex-1"
          data={channelData}
          context={{ attempt }}
          itemIdentity={(item) => item.patchKey}
          computeItemKey={({ data }) => data.patchKey}
          ItemContent={ItemContent}
          Header={() => <div className="h-2"></div>} // Padding
          Footer={() => <div className="h-2"></div>} // Padding
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
