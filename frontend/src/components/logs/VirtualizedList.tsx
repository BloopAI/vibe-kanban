import { VList, VListHandle } from 'virtua';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { ArrowDown, ArrowUp, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  PaginationPreset,
  usePaginationOverride,
} from '@/stores/usePaginationOverride';
import { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';
import { useTranslation } from 'react-i18next';

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

const LARGE_BURST = 10;

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const { t } = useTranslation('common');
  const [items, setItems] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const [atTop, setAtTop] = useState(true);
  const { setEntries, reset } = useEntries();
  const [paginationOverride, setPaginationOverride] = usePaginationOverride(
    attempt.id
  );

  useEffect(() => {
    setLoading(true);
    setItems([]);
    reset();
    didInitScroll.current = false;
    prevLenRef.current = 0;
    setAtTop(true);
    setAtBottom(true);
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

  const listRef = useRef<VListHandle>(null);
  const didInitScroll = useRef(false);
  const prevLenRef = useRef(0);
  const messageListContext = useMemo(
    () => ({ attempt, task }),
    [attempt, task]
  );

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToIndex(items.length - 1, {
      align: 'end',
      smooth: true,
    });
  }, [items.length]);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToIndex(0, { align: 'start', smooth: true });
  }, []);

  // Initial jump to bottom + auto-follow during streaming
  useEffect(() => {
    const prev = prevLenRef.current;
    const grewBy = items.length - prev;
    prevLenRef.current = items.length;

    if (items.length === 0) return;

    if (!didInitScroll.current) {
      didInitScroll.current = true;
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex(items.length - 1, { align: 'end' });
      });
      return;
    }

    if (grewBy > 0 && atBottom && !loading) {
      const smooth = grewBy < LARGE_BURST;
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex(items.length - 1, {
          align: 'end',
          smooth,
        });
      });
    }
  }, [items.length, atBottom, loading]);

  return (
    <ApprovalFormProvider>
      <div className="relative flex-1 flex flex-col">
        <VList
          ref={listRef}
          className="flex-1"
          data={items}
          bufferSize={600}
          style={{ paddingTop: 8, paddingBottom: 8 }}
          onScroll={(offset) => {
            const h = listRef.current;
            if (!h) return;
            setAtTop(offset <= 0);
            setAtBottom(offset + h.viewportSize >= h.scrollSize - 2);
          }}
        >
          {(item) => (
            <ItemContent
              key={item.patchKey}
              data={item}
              context={messageListContext}
            />
          )}
        </VList>
        {!atTop && items.length > 0 && !loading && (
          <Button
            variant="outline"
            size="icon"
            className="absolute top-4 right-4 rounded-full shadow-lg bg-background/90 backdrop-blur-sm hover:bg-background z-10"
            onClick={scrollToTop}
            aria-label="Scroll to top"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
        {!loading && items.length > 0 && (
          <div className="absolute top-1/2 -translate-y-1/2 right-4 z-10">
            <Select
              value={String(paginationOverride)}
              onValueChange={(value) =>
                setPaginationOverride(
                  value === 'global'
                    ? 'global'
                    : (Number(value) as PaginationPreset)
                )
              }
            >
              <SelectTrigger
                className="w-8 h-8 p-0 justify-center rounded-full shadow-lg bg-background/90 backdrop-blur-sm border-input [&>svg:last-child]:hidden"
                aria-label="Pagination settings"
              >
                <Settings2 className="h-4 w-4" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="global">
                  {t('conversation.pagination.global')}
                </SelectItem>
                <SelectItem value="50">
                  {t('conversation.pagination.entries50')}
                </SelectItem>
                <SelectItem value="100">
                  {t('conversation.pagination.entries100')}
                </SelectItem>
                <SelectItem value="200">
                  {t('conversation.pagination.entries200')}
                </SelectItem>
                <SelectItem value="500">
                  {t('conversation.pagination.entries500')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {!atBottom && items.length > 0 && !loading && (
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-4 right-4 rounded-full shadow-lg bg-background/90 backdrop-blur-sm hover:bg-background z-10"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
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
