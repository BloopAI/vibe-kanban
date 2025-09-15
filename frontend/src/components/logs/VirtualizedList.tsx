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

const VirtualizedList = ({ attempt }: VirtualizedListProps) => {
  const [channelData, setChannelData] = useState<ChannelData>(null);
  const [loading, setLoading] = useState(true);

  // When attempt changes, set loading
  useEffect(() => {
    setLoading(true);
  }, [attempt.id]);

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
    if (loading) {
      setLoading(newLoading);
    }
  };
  useConversationHistory({ attempt, onEntriesUpdated });

  const messageListRef = useRef<VirtuosoMessageListMethods | null>(null);

  const ItemContent: VirtuosoMessageListProps<
    PatchTypeWithKey,
    null
  >['ItemContent'] = ({ data }) => {
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
          taskAttempt={attempt}
        />
      );
    }
  };

  const computeItemKey: VirtuosoMessageListProps<
    PatchTypeWithKey,
    null
  >['computeItemKey'] = ({ data }) => {
    return `l-${data.patchKey}`;
  };

  return (
    <>
      <VirtuosoMessageListLicense
        licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
      >
        <VirtuosoMessageList<PatchTypeWithKey, null>
          ref={messageListRef}
          className="flex-1"
          data={channelData}
          computeItemKey={computeItemKey}
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
