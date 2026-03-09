import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';

import { buildConversationRows } from '../model/conversation-row-model';
import { useConversationVirtualizer } from '../model/useConversationVirtualizer';
import { useScrollCommandExecutor } from '../model/useScrollCommandExecutor';

import { cn } from '@/shared/lib/utils';
import DisplayConversationEntry from './DisplayConversationEntry';
import { ApprovalFormProvider } from '@/shared/hooks/ApprovalForm';
import { useEntries } from '../model/contexts/EntriesContext';
import {
  useResetProcess,
  type UseResetProcessResult,
} from '../model/hooks/useResetProcess';
import type {
  AddEntryType,
  PatchTypeWithKey,
  DisplayEntry,
} from '@/shared/hooks/useConversationHistory/types';
import {
  isAggregatedGroup,
  isAggregatedDiffGroup,
  isAggregatedThinkingGroup,
} from '@/shared/hooks/useConversationHistory/types';
import { useConversationHistory } from '../model/hooks/useConversationHistory';
import { aggregateConsecutiveEntries } from '@/shared/lib/aggregateEntries';
import type { WorkspaceWithSession } from '@/shared/types/attempt';
import type { RepoWithTargetBranch } from 'shared/types';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { ChatScriptPlaceholder } from '@vibe/ui/components/ChatScriptPlaceholder';
import { ScriptFixerDialog } from '@/shared/dialogs/scripts/ScriptFixerDialog';

interface ConversationListProps {
  attempt: WorkspaceWithSession;
  onAtBottomChange?: (atBottom: boolean) => void;
}

export interface ConversationListHandle {
  scrollToPreviousUserMessage: () => void;
  scrollToBottom: () => void;
}

/**
 * Render a single conversation row's content based on its DisplayEntry type.
 * Replaces the Virtuoso `ItemContent` callback with a plain function that
 * dispatches to DisplayConversationEntrySpaced (the default export).
 */
function renderRowContent(
  entry: DisplayEntry,
  attempt: WorkspaceWithSession,
  resetAction: UseResetProcessResult
): React.ReactNode {
  if (isAggregatedGroup(entry)) {
    return (
      <DisplayConversationEntry
        expansionKey={entry.patchKey}
        aggregatedGroup={entry}
        aggregatedDiffGroup={null}
        aggregatedThinkingGroup={null}
        entry={null}
        executionProcessId={entry.executionProcessId}
        workspaceWithSession={attempt}
        resetAction={resetAction}
      />
    );
  }

  if (isAggregatedDiffGroup(entry)) {
    return (
      <DisplayConversationEntry
        expansionKey={entry.patchKey}
        aggregatedGroup={null}
        aggregatedDiffGroup={entry}
        aggregatedThinkingGroup={null}
        entry={null}
        executionProcessId={entry.executionProcessId}
        workspaceWithSession={attempt}
        resetAction={resetAction}
      />
    );
  }

  if (isAggregatedThinkingGroup(entry)) {
    return (
      <DisplayConversationEntry
        expansionKey={entry.patchKey}
        aggregatedGroup={null}
        aggregatedDiffGroup={null}
        aggregatedThinkingGroup={entry}
        entry={null}
        executionProcessId={entry.executionProcessId}
        workspaceWithSession={attempt}
        resetAction={resetAction}
      />
    );
  }

  if (entry.type === 'STDOUT') {
    return <p>{entry.content}</p>;
  }
  if (entry.type === 'STDERR') {
    return <p>{entry.content}</p>;
  }

  if (entry.type === 'NORMALIZED_ENTRY') {
    return (
      <DisplayConversationEntry
        expansionKey={entry.patchKey}
        entry={entry.content}
        aggregatedGroup={null}
        aggregatedDiffGroup={null}
        aggregatedThinkingGroup={null}
        executionProcessId={entry.executionProcessId}
        workspaceWithSession={attempt}
        resetAction={resetAction}
      />
    );
  }

  return null;
}

export const ConversationList = forwardRef<
  ConversationListHandle,
  ConversationListProps
>(function ConversationList({ attempt, onAtBottomChange }, ref) {
  const resetAction = useResetProcess();
  const [filteredEntries, setFilteredEntries] = useState<DisplayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { setEntries, reset } = useEntries();
  const pendingUpdateRef = useRef<{
    entries: PatchTypeWithKey[];
    addType: AddEntryType;
    loading: boolean;
  } | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get repos from workspace context to check if scripts are configured
  let repos: RepoWithTargetBranch[] = [];
  try {
    const workspaceContext = useWorkspaceContext();
    repos = workspaceContext.repos;
  } catch {
    // Context not available
  }

  // Use ref to access current repos without causing callback recreation
  const reposRef = useRef(repos);
  reposRef.current = repos;

  // Check if any repo has setup or cleanup scripts configured
  const hasSetupScript = repos.some((repo) => repo.setup_script);
  const hasCleanupScript = repos.some((repo) => repo.cleanup_script);

  // Handlers to open script fixer dialog for setup/cleanup scripts
  const handleConfigureSetup = useCallback(() => {
    const currentRepos = reposRef.current;
    if (currentRepos.length === 0) return;

    ScriptFixerDialog.show({
      scriptType: 'setup',
      repos: currentRepos,
      workspaceId: attempt.id,
      sessionId: attempt.session?.id,
    });
  }, [attempt.id, attempt.session?.id]);

  const handleConfigureCleanup = useCallback(() => {
    const currentRepos = reposRef.current;
    if (currentRepos.length === 0) return;

    ScriptFixerDialog.show({
      scriptType: 'cleanup',
      repos: currentRepos,
      workspaceId: attempt.id,
      sessionId: attempt.session?.id,
    });
  }, [attempt.id, attempt.session?.id]);

  // Determine if configure buttons should be shown
  const canConfigure = repos.length > 0;

  useEffect(() => {
    setLoading(true);
    setFilteredEntries([]);
    reset();
  }, [attempt.id, reset]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // ---- TanStack Virtual plumbing ----
  const tanstackScrollRef = useRef<HTMLDivElement | null>(null);
  const conversationRows = useMemo(
    () => buildConversationRows(filteredEntries),
    [filteredEntries]
  );
  const conversationVirtualizer = useConversationVirtualizer({
    rows: conversationRows,
    scrollContainerRef: tanstackScrollRef,
    onAtBottomChange,
  });

  const scrollExecutor = useScrollCommandExecutor({
    virtualizer: conversationVirtualizer.virtualizer,
    itemCount: conversationRows.length,
    isAtBottom: conversationVirtualizer.isAtBottom,
  });

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

      const aggregatedEntries = aggregateConsecutiveEntries(pending.entries);

      // Filter out entries that render as null –
      // leaving them in creates empty items that add spacing.
      const newFilteredEntries = aggregatedEntries.filter((entry) => {
        if (
          'type' in entry &&
          entry.type === 'NORMALIZED_ENTRY' &&
          typeof entry.content !== 'string' &&
          'entry_type' in entry.content
        ) {
          const t = entry.content.entry_type.type;
          return t !== 'next_action' && t !== 'token_usage_info';
        }
        return true;
      });

      setFilteredEntries(newFilteredEntries);
      setEntries(pending.entries);

      scrollExecutor.onEntriesChanged(pending.addType, loading);

      if (loading) {
        setLoading(pending.loading);
      }
    }, 100);
  };

  const {
    hasSetupScriptRun,
    hasCleanupScriptRun,
    hasRunningProcess,
    isFirstTurn,
  } = useConversationHistory({ attempt, onEntriesUpdated });

  // Determine if there are entries to show placeholders
  const hasEntries = filteredEntries.length > 0;

  // Show placeholders only if script not configured AND not already run AND first turn
  const showSetupPlaceholder =
    !hasSetupScript && !hasSetupScriptRun && hasEntries;
  const showCleanupPlaceholder =
    !hasCleanupScript &&
    !hasCleanupScriptRun &&
    !hasRunningProcess &&
    hasEntries &&
    isFirstTurn;

  // Expose scroll functionality via ref — delegates to TanStack Virtual
  useImperativeHandle(
    ref,
    () => ({
      scrollToPreviousUserMessage: () => {
        conversationVirtualizer.scrollToPreviousUserMessage();
      },
      scrollToBottom: () => {
        scrollExecutor.requestJumpToBottom();
      },
    }),
    [conversationVirtualizer, scrollExecutor]
  );

  // Determine if content is ready to show (has data or finished loading)
  const hasContent = !loading || filteredEntries.length > 0;

  const { virtualItems, totalSize, measureElement } = conversationVirtualizer;

  return (
    <ApprovalFormProvider>
      <div
        className={cn(
          'relative h-full overflow-hidden transition-opacity duration-300',
          hasContent ? 'opacity-100' : 'opacity-0'
        )}
      >
        {!hasContent && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <SpinnerIcon className="size-6 animate-spin text-low" />
          </div>
        )}
        <div
          ref={tanstackScrollRef}
          className="h-full overflow-y-auto scrollbar-none"
        >
          {/* Header placeholder */}
          <div className="pt-2">
            {showSetupPlaceholder && (
              <div className="my-base px-double">
                <ChatScriptPlaceholder
                  type="setup"
                  onConfigure={canConfigure ? handleConfigureSetup : undefined}
                />
              </div>
            )}
          </div>

          {/* Virtualized conversation rows */}
          <div
            style={{
              height: `${totalSize}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualItem) => {
              const row = conversationRows[virtualItem.index];
              if (!row) return null;
              return (
                <div
                  key={row.semanticKey}
                  data-index={virtualItem.index}
                  ref={measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {renderRowContent(row.entry, attempt, resetAction)}
                </div>
              );
            })}
          </div>

          {/* Footer placeholder */}
          <div className="pb-2">
            {showCleanupPlaceholder && (
              <div className="my-base px-double">
                <ChatScriptPlaceholder
                  type="cleanup"
                  onConfigure={
                    canConfigure ? handleConfigureCleanup : undefined
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </ApprovalFormProvider>
  );
});

export default ConversationList;
