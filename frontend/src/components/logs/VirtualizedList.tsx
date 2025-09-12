import {
  DataWithScrollModifier,
  ScrollModifier,
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListMethods,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import { useCallback, useEffect, useRef, useState } from 'react';

import ApprovalResponseEntry from '../logs/ApprovalResponseEntry';
import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import PendingApprovalEntry from '../NormalizedConversation/PendingApprovalEntry';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { useExpandableStore } from '@/stores/useExpandableStore';
import { Loader2 } from 'lucide-react';
import { TaskAttempt, type ApprovalRequest } from 'shared/types';

interface VirtualizedListProps {
  attempt: TaskAttempt;
}

// Display approval response messages for 3 seconds before fading out
const APPROVAL_RESPONSE_DISPLAY_TIME = 3000;

type PendingApprovalState = {
  requestId: string;
  entryPatchKey: string | null;
  approval: ApprovalRequest;
};

const INITIAL_TOP_ITEM = { index: 'LAST' as const, align: 'end' as const };

const derivePendingApproval = (
  previous: PendingApprovalState | null,
  entries: PatchTypeWithKey[],
  collapseTool: (patchKey: string) => void
): PendingApprovalState | null => {
  let latestToolPatchKey: string | null = null;
  let next = previous;

  for (const entry of entries) {
    if (
      entry.type === 'NORMALIZED_ENTRY' &&
      entry.content.entry_type?.type === 'tool_use'
    ) {
      latestToolPatchKey = entry.patchKey;
    }

    if (entry.type === 'APPROVAL_REQUEST') {
      next = {
        requestId: entry.content.id,
        entryPatchKey: latestToolPatchKey,
        approval: entry.content,
      };
    }

    if (
      entry.type === 'APPROVAL_RESPONSE' &&
      next?.requestId === entry.content.id
    ) {
      if (next.entryPatchKey) {
        collapseTool(next.entryPatchKey);
      }
      next = null;
    }
  }

  return next;
};

const useApprovalEntryManager = () => {
  const [pendingApproval, setPendingApproval] =
    useState<PendingApprovalState | null>(null);
  const approvalResponseTimestamps = useRef<Map<string, number>>(new Map());
  const [hiddenApprovalResponses, setHiddenApprovalResponses] = useState<
    Set<string>
  >(new Set());
  const setExpandableKey = useExpandableStore((s) => s.setKey);

  const collapseToolForPatch = useCallback(
    (patchKey: string) => {
      queueMicrotask(() => {
        setExpandableKey(`tool-entry:${patchKey}`, false);
      });
    },
    [setExpandableKey]
  );

  const reset = useCallback(() => {
    approvalResponseTimestamps.current.clear();
    setHiddenApprovalResponses(new Set());
    setPendingApproval(null);
  }, []);

  const registerResponseTimers = useCallback(
    (entries: PatchTypeWithKey[], addType: AddEntryType) => {
      if (addType !== 'running') return;

      const now = Date.now();
      for (const entry of entries) {
        if (entry.type !== 'APPROVAL_RESPONSE') continue;

        const responseId = entry.content.id;
        if (approvalResponseTimestamps.current.has(responseId)) continue;

        approvalResponseTimestamps.current.set(responseId, now);
        window.setTimeout(() => {
          setHiddenApprovalResponses((prev) => {
            if (prev.has(responseId)) return prev;
            const next = new Set(prev);
            next.add(responseId);
            return next;
          });
        }, APPROVAL_RESPONSE_DISPLAY_TIME);
      }
    },
    []
  );

  const processEntries = useCallback(
    (entries: PatchTypeWithKey[], addType: AddEntryType) => {
      registerResponseTimers(entries, addType);

      const responseIds = new Set<string>();
      for (const entry of entries) {
        if (entry.type === 'APPROVAL_RESPONSE') {
          responseIds.add(entry.content.id);
        }
      }

      const withoutRequests = entries.filter((entry) => {
        if (entry.type !== 'APPROVAL_REQUEST') return true;
        return !responseIds.has(entry.content.id);
      });

      const visibleEntries: PatchTypeWithKey[] = [];
      for (const entry of withoutRequests) {
        if (entry.type === 'APPROVAL_REQUEST') {
          continue;
        }

        if (entry.type === 'APPROVAL_RESPONSE') {
          const responseId = entry.content.id;
          const seenDuringRun =
            approvalResponseTimestamps.current.has(responseId);
          const isHidden = hiddenApprovalResponses.has(responseId);

          if ((addType !== 'running' && !seenDuringRun) || isHidden) {
            continue;
          }
        }

        visibleEntries.push(entry);
      }

      setPendingApproval((prev) =>
        derivePendingApproval(prev, withoutRequests, collapseToolForPatch)
      );

      return visibleEntries;
    },
    [collapseToolForPatch, hiddenApprovalResponses, registerResponseTimers]
  );

  return {
    pendingApproval,
    processEntries,
    reset,
  };
};

const InitialDataScrollModifier: ScrollModifier = {
  type: 'item-location',
  location: INITIAL_TOP_ITEM,
  purgeItemSizes: true,
};

const AutoScrollToBottom: ScrollModifier = {
  type: 'auto-scroll-to-bottom',
  autoScroll: 'smooth',
};

const VirtualizedList = ({ attempt }: VirtualizedListProps) => {
  const [channelData, setChannelData] =
    useState<DataWithScrollModifier<PatchTypeWithKey> | null>(null);
  const [loading, setLoading] = useState(true);
  const { pendingApproval, processEntries, reset } = useApprovalEntryManager();

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
    const visibleEntries = processEntries(newEntries, addType);
    let scrollModifier: ScrollModifier = InitialDataScrollModifier;
    if (addType === 'running' && !loading) {
      scrollModifier = AutoScrollToBottom;
    }

    setChannelData({ data: visibleEntries, scrollModifier });

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
    }
    if (data.type === 'STDERR') {
      return <p>{data.content}</p>;
    }
    if (data.type === 'NORMALIZED_ENTRY') {
      const shouldWrap =
        pendingApproval?.entryPatchKey != null &&
        pendingApproval.entryPatchKey === data.patchKey &&
        pendingApproval.approval != null;

      if (shouldWrap && pendingApproval) {
        return (
          <PendingApprovalEntry
            entry={data.content}
            expansionKey={data.patchKey}
            approval={pendingApproval.approval}
            executionProcessId={data.executionProcessId}
            taskAttempt={attempt}
          />
        );
      }

      return (
        <DisplayConversationEntry
          expansionKey={data.patchKey}
          entry={data.content}
          executionProcessId={data.executionProcessId}
          taskAttempt={attempt}
        />
      );
    }

    if (data.type === 'APPROVAL_RESPONSE') {
      return <ApprovalResponseEntry response={data.content} />;
    }

    return null;
  };

  const computeItemKey: VirtuosoMessageListProps<
    PatchTypeWithKey,
    null
  >['computeItemKey'] = ({ data }) => `l-${data.patchKey}`;

  return (
    <>
      <VirtuosoMessageListLicense
        licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
      >
        <VirtuosoMessageList<PatchTypeWithKey, null>
          ref={messageListRef}
          className="flex-1"
          data={channelData}
          initialLocation={INITIAL_TOP_ITEM}
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
