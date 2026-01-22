import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataWithScrollModifier,
  ScrollModifier,
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListMethods,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
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

type LogEntryWithKey = LogEntry & { key: string; originalIndex: number };

interface SearchContext {
  searchQuery: string;
  matchIndices: number[];
  currentMatchIndex: number;
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

const computeItemKey: VirtuosoMessageListProps<
  LogEntryWithKey,
  SearchContext
>['computeItemKey'] = ({ data }) => data.key;

const ItemContent: VirtuosoMessageListProps<
  LogEntryWithKey,
  SearchContext
>['ItemContent'] = ({ data, context }) => {
  const isMatch = context.matchIndices.includes(data.originalIndex);
  const isCurrentMatch =
    context.matchIndices[context.currentMatchIndex] === data.originalIndex;

  return (
    <RawLogText
      content={data.content}
      channel={data.type === 'STDERR' ? 'stderr' : 'stdout'}
      className="text-sm px-4 py-1"
      linkifyUrls
      searchQuery={isMatch ? context.searchQuery : undefined}
      isCurrentMatch={isCurrentMatch}
    />
  );
};

const fallbackItemContent = (
  data: LogEntryWithKey,
  context: SearchContext
) => {
  const isMatch = context.matchIndices.includes(data.originalIndex);
  const isCurrentMatch =
    context.matchIndices[context.currentMatchIndex] === data.originalIndex;

  return (
    <RawLogText
      content={data.content}
      channel={data.type === 'STDERR' ? 'stderr' : 'stdout'}
      className="text-sm px-4 py-1"
      linkifyUrls
      searchQuery={isMatch ? context.searchQuery : undefined}
      isCurrentMatch={isCurrentMatch}
    />
  );
};

export function VirtualizedProcessLogs({
  logs,
  error,
  searchQuery,
  matchIndices,
  currentMatchIndex,
}: VirtualizedProcessLogsProps) {
  const { t } = useTranslation('tasks');
  const [channelData, setChannelData] =
    useState<DataWithScrollModifier<LogEntryWithKey> | null>(null);
  const messageListRef =
    useRef<VirtuosoMessageListMethods<LogEntryWithKey, SearchContext> | null>(
      null
    );
  const fallbackRef = useRef<VirtuosoHandle | null>(null);
  const prevLogsLengthRef = useRef(0);
  const prevCurrentMatchRef = useRef<number | undefined>(undefined);
  const licenseKey = import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY;
  const useLicensedList = Boolean(licenseKey);
  const [followOutput, setFollowOutput] = useState<false | 'smooth'>(false);
  const initialTopMostItemIndex = channelData?.data?.length
    ? Math.max(channelData.data.length - 1, 0)
    : 0;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Add keys and original index to log entries
      const logsWithKeys: LogEntryWithKey[] = logs.map((entry, index) => ({
        ...entry,
        key: `log-${index}`,
        originalIndex: index,
      }));

      // Determine scroll modifier based on whether this is initial load or update
      let scrollModifier: ScrollModifier;
      if (prevLogsLengthRef.current === 0 && logs.length > 0) {
        // Initial load - scroll to bottom
        scrollModifier = InitialDataScrollModifier;
        setFollowOutput('smooth');
      } else if (logs.length > prevLogsLengthRef.current) {
        // New logs added - auto-scroll to bottom
        scrollModifier = AutoScrollToBottom;
        setFollowOutput('smooth');
      } else {
        // No new logs - keep current position
        scrollModifier = AutoScrollToBottom;
        setFollowOutput(false);
      }

      prevLogsLengthRef.current = logs.length;
      setChannelData({ data: logsWithKeys, scrollModifier });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [logs]);

  // Scroll to current match when it changes
  useEffect(() => {
    if (
      matchIndices.length > 0 &&
      currentMatchIndex >= 0 &&
      currentMatchIndex !== prevCurrentMatchRef.current
    ) {
      const logIndex = matchIndices[currentMatchIndex];
      if (useLicensedList) {
        messageListRef.current?.scrollToItem({
          index: logIndex,
          align: 'center',
          behavior: 'smooth',
        });
      } else {
        fallbackRef.current?.scrollToIndex({
          index: logIndex,
          align: 'center',
          behavior: 'smooth',
        });
      }
      prevCurrentMatchRef.current = currentMatchIndex;
    }
  }, [currentMatchIndex, matchIndices, useLicensedList]);

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

  const context: SearchContext = {
    searchQuery,
    matchIndices,
    currentMatchIndex,
  };

  return (
    <div className="h-full">
      {useLicensedList ? (
        <VirtuosoMessageListLicense licenseKey={licenseKey}>
          <VirtuosoMessageList<LogEntryWithKey, SearchContext>
            ref={messageListRef}
            className="h-full"
            data={channelData}
            context={context}
            initialLocation={INITIAL_TOP_ITEM}
            computeItemKey={computeItemKey}
            ItemContent={ItemContent}
          />
        </VirtuosoMessageListLicense>
      ) : (
        <Virtuoso
          ref={fallbackRef}
          className="h-full"
          data={channelData?.data ?? []}
          followOutput={followOutput}
          initialTopMostItemIndex={initialTopMostItemIndex}
          itemContent={(_index: number, data: LogEntryWithKey) =>
            fallbackItemContent(data, context)
          }
        />
      )}
    </div>
  );
}
