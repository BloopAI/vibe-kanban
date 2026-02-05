import {
  DataWithScrollModifier,
  ScrollModifier,
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListMethods,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';
import NewDisplayConversationEntry from './NewDisplayConversationEntry';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  DisplayEntry,
  isAggregatedGroup,
  isAggregatedDiffGroup,
  isScriptPlaceholder,
  useConversationHistory,
  ScriptPlaceholderEntry,
} from '@/components/ui-new/hooks/useConversationHistory';
import { aggregateConsecutiveEntries } from '@/utils/aggregateEntries';
import type { WorkspaceWithSession } from '@/types/attempt';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ChatScriptPlaceholder } from '../primitives/conversation/ChatScriptPlaceholder';
import { SettingsDialog } from '../dialogs/SettingsDialog';

interface ConversationListProps {
  attempt: WorkspaceWithSession;
}

export interface ConversationListHandle {
  scrollToPreviousUserMessage: () => void;
  scrollToBottom: () => void;
}

interface MessageListContext {
  attempt: WorkspaceWithSession;
  onOpenSettings: (() => void) | undefined;
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

const ScrollToTopOfLastItem: ScrollModifier = {
  type: 'item-location',
  location: {
    index: 'LAST',
    align: 'start',
  },
};

const ItemContent: VirtuosoMessageListProps<
  DisplayEntry,
  MessageListContext
>['ItemContent'] = ({ data, context }) => {
  const attempt = context?.attempt;
  const onOpenSettings = context?.onOpenSettings;

  // Handle script placeholder entries
  if (isScriptPlaceholder(data)) {
    return (
      <div className="my-base px-double">
        <ChatScriptPlaceholder
          type={data.scriptType}
          onOpenSettings={onOpenSettings}
        />
      </div>
    );
  }

  // Handle aggregated tool groups (file_read, search, web_fetch)
  if (isAggregatedGroup(data)) {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        aggregatedGroup={data}
        aggregatedDiffGroup={null}
        entry={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
      />
    );
  }

  // Handle aggregated diff groups (file_edit by same path)
  if (isAggregatedDiffGroup(data)) {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        aggregatedGroup={null}
        aggregatedDiffGroup={data}
        entry={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
      />
    );
  }

  if (data.type === 'STDOUT') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'STDERR') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'NORMALIZED_ENTRY' && attempt) {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
        aggregatedGroup={null}
        aggregatedDiffGroup={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
      />
    );
  }

  return null;
};

const computeItemKey: VirtuosoMessageListProps<
  DisplayEntry,
  MessageListContext
>['computeItemKey'] = ({ data }) => `conv-${data.patchKey}`;

export const ConversationList = forwardRef<
  ConversationListHandle,
  ConversationListProps
>(function ConversationList({ attempt }, ref) {
  const [channelData, setChannelData] =
    useState<DataWithScrollModifier<DisplayEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const { setEntries, reset } = useEntries();
  const pendingUpdateRef = useRef<{
    entries: PatchTypeWithKey[];
    addType: AddEntryType;
    loading: boolean;
  } | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get repos from workspace context to check if scripts are configured
  let repos: {
    id: string;
    setup_script: string | null;
    cleanup_script: string | null;
  }[] = [];
  try {
    const workspaceContext = useWorkspaceContext();
    repos = workspaceContext.repos;
  } catch {
    // Context not available
  }

  // Check if any repo has setup or cleanup scripts configured
  const hasSetupScript = repos.some((repo) => repo.setup_script);
  const hasCleanupScript = repos.some((repo) => repo.cleanup_script);

  // Use refs for current values (needed for callbacks and settings dialog)
  const reposRef = useRef(repos);
  const hasSetupScriptRef = useRef(hasSetupScript);
  const hasCleanupScriptRef = useRef(hasCleanupScript);
  reposRef.current = repos;
  hasSetupScriptRef.current = hasSetupScript;
  hasCleanupScriptRef.current = hasCleanupScript;

  // Handler to open repository settings dialog (first repo in workspace)
  const handleOpenSettings = useMemo(
    () => () => {
      const firstRepoId = reposRef.current[0]?.id;
      SettingsDialog.show({
        initialSection: 'repos',
        initialState: firstRepoId ? { repoId: firstRepoId } : undefined,
      });
    },
    []
  );

  // Create stable placeholder entries
  const setupPlaceholder = useMemo(
    (): ScriptPlaceholderEntry => ({
      type: 'SCRIPT_PLACEHOLDER',
      scriptType: 'setup',
      patchKey: 'script-placeholder-setup',
      executionProcessId: '',
    }),
    []
  );

  const cleanupPlaceholder = useMemo(
    (): ScriptPlaceholderEntry => ({
      type: 'SCRIPT_PLACEHOLDER',
      scriptType: 'cleanup',
      patchKey: 'script-placeholder-cleanup',
      executionProcessId: '',
    }),
    []
  );

  // Helper to build entries with placeholders based on script configuration
  const buildEntriesWithPlaceholders = useCallback(
    (
      entries: PatchTypeWithKey[],
      hasSetupScriptConfig: boolean,
      hasCleanupScriptConfig: boolean
    ): DisplayEntry[] => {
      const aggregatedEntries = aggregateConsecutiveEntries(entries);
      if (aggregatedEntries.length === 0) return aggregatedEntries;

      // Check if scripts have already run in this conversation
      const hasSetupScriptEntry = entries.some(
        (entry) =>
          entry.type === 'NORMALIZED_ENTRY' &&
          entry.content.entry_type.type === 'tool_use' &&
          entry.content.entry_type.tool_name === 'Setup Script'
      );
      const hasCleanupScriptEntry = entries.some(
        (entry) =>
          entry.type === 'NORMALIZED_ENTRY' &&
          entry.content.entry_type.type === 'tool_use' &&
          entry.content.entry_type.tool_name === 'Cleanup Script'
      );
      const hasRunningProcess = entries.some(
        (entry) =>
          entry.type === 'NORMALIZED_ENTRY' &&
          entry.content.entry_type.type === 'loading'
      );

      const result: DisplayEntry[] = [];

      // Setup placeholder: show if no script configured AND none has run
      if (!hasSetupScriptConfig && !hasSetupScriptEntry) {
        result.push(setupPlaceholder);
      }

      result.push(...aggregatedEntries);

      // Cleanup placeholder: show if no script configured AND none has run AND agent finished
      if (!hasCleanupScriptConfig && !hasCleanupScriptEntry && !hasRunningProcess) {
        result.push(cleanupPlaceholder);
      }

      return result;
    },
    [setupPlaceholder, cleanupPlaceholder]
  );

  useEffect(() => {
    setLoading(true);
    setChannelData(null);
    reset();
  }, [attempt.id, reset]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType,
    newLoading: boolean
  ) => {
    pendingUpdateRef.current = {
      entries: newEntries,
      addType,
      loading: newLoading,
    };

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const pending = pendingUpdateRef.current;
      if (!pending) return;

      let scrollModifier: ScrollModifier = InitialDataScrollModifier;

      if (pending.addType === 'plan' && !loading) {
        scrollModifier = ScrollToTopOfLastItem;
      } else if (pending.addType === 'running' && !loading) {
        scrollModifier = AutoScrollToBottom;
      }

      const entriesWithPlaceholders = buildEntriesWithPlaceholders(
        pending.entries,
        hasSetupScriptRef.current,
        hasCleanupScriptRef.current
      );

      setChannelData({ data: entriesWithPlaceholders, scrollModifier });
      setEntries(pending.entries);

      if (loading) {
        setLoading(pending.loading);
      }
    }, 100);
  };

  useConversationHistory({ attempt, onEntriesUpdated });

  // Re-process entries when script configuration changes
  useEffect(() => {
    const pending = pendingUpdateRef.current;
    if (!pending || pending.entries.length === 0) return;

    const entriesWithPlaceholders = buildEntriesWithPlaceholders(
      pending.entries,
      hasSetupScript,
      hasCleanupScript
    );

    setChannelData((prev) =>
      prev ? { ...prev, data: entriesWithPlaceholders } : null
    );
  }, [hasSetupScript, hasCleanupScript, buildEntriesWithPlaceholders]);

  const messageListRef = useRef<VirtuosoMessageListMethods | null>(null);
  const messageListContext = useMemo(
    () => ({ attempt, onOpenSettings: handleOpenSettings }),
    [attempt, handleOpenSettings]
  );

  // Expose scroll to previous user message functionality via ref
  useImperativeHandle(
    ref,
    () => ({
      scrollToPreviousUserMessage: () => {
        const data = channelData?.data;
        if (!data || !messageListRef.current) return;

        // Get currently rendered items to find visible range
        const rendered = messageListRef.current.data.getCurrentlyRendered();
        if (!rendered.length) return;

        // Find the index of the first visible item in the full data array
        const firstVisibleKey = rendered[0]?.patchKey;
        const firstVisibleIndex = data.findIndex(
          (item) => item.patchKey === firstVisibleKey
        );

        // Find all user message indices
        const userMessageIndices: number[] = [];
        data.forEach((item, index) => {
          if (
            item.type === 'NORMALIZED_ENTRY' &&
            item.content.entry_type.type === 'user_message'
          ) {
            userMessageIndices.push(index);
          }
        });

        // Find the user message before the first visible item
        const targetIndex = userMessageIndices
          .reverse()
          .find((idx) => idx < firstVisibleIndex);

        if (targetIndex !== undefined) {
          messageListRef.current.scrollToItem({
            index: targetIndex,
            align: 'start',
            behavior: 'smooth',
          });
        }
      },
      scrollToBottom: () => {
        if (!messageListRef.current) return;
        messageListRef.current.scrollToItem({
          index: 'LAST',
          align: 'end',
          behavior: 'smooth',
        });
      },
    }),
    [channelData]
  );

  // Determine if content is ready to show (has data or finished loading)
  const hasContent = !loading || (channelData?.data?.length ?? 0) > 0;

  return (
    <ApprovalFormProvider>
      <div
        className={cn(
          'h-full transition-opacity duration-300',
          hasContent ? 'opacity-100' : 'opacity-0'
        )}
      >
        <VirtuosoMessageListLicense
          licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
        >
          <VirtuosoMessageList<DisplayEntry, MessageListContext>
            ref={messageListRef}
            className="h-full scrollbar-none"
            data={channelData}
            initialLocation={INITIAL_TOP_ITEM}
            context={messageListContext}
            computeItemKey={computeItemKey}
            ItemContent={ItemContent}
            Header={() => <div className="h-2" />}
            Footer={() => <div className="h-2" />}
          />
        </VirtuosoMessageListLicense>
      </div>
    </ApprovalFormProvider>
  );
});

export default ConversationList;
