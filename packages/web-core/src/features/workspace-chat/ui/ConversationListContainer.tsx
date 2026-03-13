import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

import {
  buildConversationRowsIncremental,
  findPreviousUserMessageIndex,
  type ConversationRow,
} from '../model/conversation-row-model';
import { useConversationVirtualizer } from '../model/useConversationVirtualizer';
import { useScrollCommandExecutor } from '../model/useScrollCommandExecutor';

import DisplayConversationEntry from './DisplayConversationEntry';
import { ApprovalFormProvider } from '@/shared/hooks/ApprovalForm';
import { useEntriesActions } from '../model/contexts/EntriesContext';
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
import { ChatEmptyState } from '@vibe/ui/components/ChatEmptyState';
import { ChatScriptPlaceholder } from '@vibe/ui/components/ChatScriptPlaceholder';
import { ScriptFixerDialog } from '@/shared/dialogs/scripts/ScriptFixerDialog';

interface ConversationListProps {
  attempt: WorkspaceWithSession;
  repos?: RepoWithTargetBranch[];
  onAtBottomChange?: (atBottom: boolean) => void;
  sessionScopeId?: string;
}

export interface ConversationListHandle {
  scrollToPreviousUserMessage: () => void;
  scrollToBottom: (behavior?: 'auto' | 'smooth') => void;
  adjustScrollBy: (delta: number) => void;
}

const ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 8;

function renderRowContent(
  entry: DisplayEntry,
  attempt: WorkspaceWithSession,
  resetAction: UseResetProcessResult,
  repos: RepoWithTargetBranch[]
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
        repos={repos}
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
        repos={repos}
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
        repos={repos}
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
        repos={repos}
      />
    );
  }

  return null;
}

export const ConversationList = forwardRef<
  ConversationListHandle,
  ConversationListProps
>(function ConversationList(
  { attempt, repos: reposProp = [], onAtBottomChange, sessionScopeId },
  ref
) {
  const { t } = useTranslation('common');
  const repos = reposProp;
  const resetAction = useResetProcess(attempt.id, attempt.session?.id);
  const conversationScopeKey = `${attempt.id}:${sessionScopeId ?? attempt.session?.id ?? 'new'}`;
  const [filteredEntries, setFilteredEntries] = useState<DisplayEntry[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const lastSettledTailStartIndexRef = useRef<number | null>(null);
  const { setEntries, reset } = useEntriesActions();
  const scrollOnEntriesChangedRef = useRef<
    ((addType: AddEntryType, isInitialLoad: boolean) => void) | null
  >(null);
  const pendingUpdateRef = useRef<{
    entries: PatchTypeWithKey[];
    addType: AddEntryType;
    loading: boolean;
    isInitialLoad: boolean;
  } | null>(null);
  // rAF throttle: at most one state update per animation frame.
  // Replaces the previous 100ms trailing debounce which never fired during
  // continuous streaming (upstream rAF in streamJsonPatchEntries reset the
  // timer every ~16ms). TanStack Virtual has no internal batching — unlike
  // Virtuoso — so we need to drive renders explicitly via React state.
  // rAF naturally limits updates to the display refresh rate (~60fps) while
  // ensuring every frame reflects the latest data.
  const rafIdRef = useRef<number | null>(null);
  const pendingInteractionAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const pendingInteractionAnchorFrameRef = useRef<number | null>(null);

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
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingUpdateRef.current = null;
    setLoading(true);
    setFilteredEntries([]);
    setDataVersion(0);
    lastSettledTailStartIndexRef.current = null;
    reset();
  }, [conversationScopeKey, reset]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // ---- TanStack Virtual plumbing ----
  const tanstackScrollRef = useRef<HTMLDivElement | null>(null);

  const clearPendingInteractionAnchor = useCallback(() => {
    if (pendingInteractionAnchorFrameRef.current !== null) {
      cancelAnimationFrame(pendingInteractionAnchorFrameRef.current);
      pendingInteractionAnchorFrameRef.current = null;
    }
    pendingInteractionAnchorRef.current = null;
  }, []);

  const handleConversationClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const trigger = target.closest<HTMLElement>(
        'button, summary, [role="button"], [data-scroll-anchor-target]'
      );
      if (!trigger || trigger.closest('[data-scroll-anchor-ignore]')) return;

      const scrollContainer = tanstackScrollRef.current;
      if (!scrollContainer || !scrollContainer.contains(trigger)) return;

      clearPendingInteractionAnchor();
      pendingInteractionAnchorRef.current = {
        element: trigger,
        top: trigger.getBoundingClientRect().top,
      };

      pendingInteractionAnchorFrameRef.current = requestAnimationFrame(() => {
        pendingInteractionAnchorFrameRef.current = null;

        const anchor = pendingInteractionAnchorRef.current;
        pendingInteractionAnchorRef.current = null;

        const activeScrollContainer = tanstackScrollRef.current;
        if (!anchor || !activeScrollContainer || !anchor.element.isConnected) {
          return;
        }

        const delta = anchor.element.getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta) < 0.5) return;

        activeScrollContainer.scrollTop += delta;
      });
    },
    [clearPendingInteractionAnchor]
  );

  const flushPendingUpdate = () => {
    rafIdRef.current = null;
    const pending = pendingUpdateRef.current;
    if (!pending) return;

    const aggregatedEntries = aggregateConsecutiveEntries(pending.entries);

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

      return (
        entry.type === 'NORMALIZED_ENTRY' ||
        entry.type === 'STDOUT' ||
        entry.type === 'STDERR' ||
        entry.type === 'AGGREGATED_GROUP' ||
        entry.type === 'AGGREGATED_DIFF_GROUP' ||
        entry.type === 'AGGREGATED_THINKING_GROUP'
      );
    });

    setFilteredEntries(newFilteredEntries);
    setDataVersion((current) => current + 1);
    setEntries(pending.entries);

    scrollOnEntriesChangedRef.current?.(pending.addType, pending.isInitialLoad);

    if (loading) {
      setLoading(pending.loading);
    }
  };

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType,
    newLoading: boolean
  ) => {
    pendingUpdateRef.current = {
      entries: newEntries,
      addType,
      loading: newLoading,
      isInitialLoad: loading,
    };

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushPendingUpdate);
    }
  };

  const {
    hasSetupScriptRun,
    hasCleanupScriptRun,
    hasRunningProcess,
    isFirstTurn,
  } = useConversationHistory({
    attempt,
    onEntriesUpdated,
    scopeKey: conversationScopeKey,
  });

  const prevEntriesRef = useRef<DisplayEntry[]>([]);
  const prevRowsRef = useRef<ConversationRow[]>([]);
  const conversationRows = useMemo(() => {
    const rows = buildConversationRowsIncremental(
      filteredEntries,
      prevEntriesRef.current,
      prevRowsRef.current
    );
    prevEntriesRef.current = filteredEntries;
    prevRowsRef.current = rows;
    return rows;
  }, [filteredEntries]);

  const hasActiveStreamingTurn = useMemo(
    () =>
      hasRunningProcess ||
      conversationRows.some((row) => row.rowFamily === 'loading'),
    [conversationRows, hasRunningProcess]
  );

  const candidateFirstUnvirtualizedRowIndex = useMemo(() => {
    const firstTailRowIndex = Math.max(
      conversationRows.length - ALWAYS_UNVIRTUALIZED_TAIL_ROWS,
      0
    );

    if (!hasActiveStreamingTurn) {
      return firstTailRowIndex;
    }

    for (let index = conversationRows.length - 1; index >= 0; index -= 1) {
      if (conversationRows[index]?.isUserMessage) {
        return Math.min(index, firstTailRowIndex);
      }
    }

    return firstTailRowIndex;
  }, [conversationRows, hasActiveStreamingTurn]);

  const streamingFirstUnvirtualizedRowIndex = useMemo(() => {
    const lastSettledTailStartIndex = lastSettledTailStartIndexRef.current;
    if (lastSettledTailStartIndex == null) {
      return candidateFirstUnvirtualizedRowIndex;
    }

    return Math.min(
      lastSettledTailStartIndex,
      candidateFirstUnvirtualizedRowIndex
    );
  }, [candidateFirstUnvirtualizedRowIndex]);

  useEffect(() => {
    if (!hasActiveStreamingTurn) {
      lastSettledTailStartIndexRef.current =
        candidateFirstUnvirtualizedRowIndex;
    }
  }, [candidateFirstUnvirtualizedRowIndex, hasActiveStreamingTurn]);

  const firstUnvirtualizedRowIndex = hasActiveStreamingTurn
    ? streamingFirstUnvirtualizedRowIndex
    : candidateFirstUnvirtualizedRowIndex;

  const virtualizedRows = useMemo(
    () => conversationRows.slice(0, firstUnvirtualizedRowIndex),
    [conversationRows, firstUnvirtualizedRowIndex]
  );

  const unvirtualizedTailRows = useMemo(
    () => conversationRows.slice(firstUnvirtualizedRowIndex),
    [conversationRows, firstUnvirtualizedRowIndex]
  );

  const conversationVirtualizer = useConversationVirtualizer({
    rows: virtualizedRows,
    scrollContainerRef: tanstackScrollRef,
    onAtBottomChange,
  });

  useLayoutEffect(() => {
    conversationVirtualizer.virtualizer.measure();
  }, [conversationVirtualizer.virtualizer, firstUnvirtualizedRowIndex]);

  const scrollToAbsoluteIndex = useCallback(
    (
      index: number,
      align: 'start' | 'center' | 'end' = 'start',
      behavior: 'auto' | 'smooth' = 'smooth'
    ): boolean => {
      if (index < 0 || index >= conversationRows.length) return false;

      const scrollEl = tanstackScrollRef.current;
      if (!scrollEl) return false;

      const targetNode = scrollEl.querySelector<HTMLElement>(
        `[data-row-index="${index}"]`
      );

      if (targetNode) {
        let top = targetNode.offsetTop;

        if (align === 'center') {
          top =
            targetNode.offsetTop -
            scrollEl.clientHeight / 2 +
            targetNode.offsetHeight / 2;
        } else if (align === 'end') {
          top =
            targetNode.offsetTop -
            scrollEl.clientHeight +
            targetNode.offsetHeight;
        }

        scrollEl.scrollTo({ top: Math.max(0, top), behavior });
        return true;
      }

      if (index < virtualizedRows.length) {
        conversationVirtualizer.scrollToIndex(index, { align, behavior });
        return true;
      }

      return false;
    },
    [conversationRows.length, conversationVirtualizer, virtualizedRows.length]
  );

  const scrollExecutor = useScrollCommandExecutor({
    virtualizer: conversationVirtualizer.virtualizer,
    itemCount: conversationRows.length,
    dataVersion,
    isAtBottom: conversationVirtualizer.isAtBottom,
    scrollToBottom: conversationVirtualizer.scrollToBottom,
    scrollToAbsoluteIndex,
  });
  scrollOnEntriesChangedRef.current = scrollExecutor.onEntriesChanged;

  // Determine if there are entries to show placeholders
  const hasEntries = conversationRows.length > 0;

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
  const scrollToPreviousUserMessage = useCallback(() => {
    const scrollEl = tanstackScrollRef.current;
    if (!scrollEl || conversationRows.length === 0) return;

    const containerTop = scrollEl.getBoundingClientRect().top;
    const rowNodes = Array.from(
      scrollEl.querySelectorAll<HTMLElement>('[data-row-index]')
    );

    let firstVisibleIndex = conversationRows.length - 1;

    for (const node of rowNodes) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= containerTop + 1) continue;
      const indexAttr = node.dataset.rowIndex;
      if (!indexAttr) continue;
      const parsedIndex = Number.parseInt(indexAttr, 10);
      if (!Number.isFinite(parsedIndex)) continue;
      firstVisibleIndex = parsedIndex;
      break;
    }

    const targetIndex = findPreviousUserMessageIndex(
      conversationRows,
      firstVisibleIndex
    );

    if (targetIndex < 0) return;

    if (scrollToAbsoluteIndex(targetIndex, 'start', 'smooth')) return;

    if (targetIndex >= firstUnvirtualizedRowIndex) {
      conversationVirtualizer.scrollToBottom();
      return;
    }

    conversationVirtualizer.scrollToIndex(targetIndex, {
      align: 'start',
      behavior: 'smooth',
    });
  }, [
    conversationRows,
    firstUnvirtualizedRowIndex,
    conversationVirtualizer,
    scrollToAbsoluteIndex,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPreviousUserMessage: () => {
        scrollToPreviousUserMessage();
      },
      scrollToBottom: (behavior = 'smooth') => {
        conversationVirtualizer.scrollToBottom(behavior);
      },
      adjustScrollBy: (delta) => {
        if (Math.abs(delta) < 0.5) return;
        const scrollElement = tanstackScrollRef.current;
        if (!scrollElement) return;
        scrollElement.scrollTop += delta;
      },
    }),
    [conversationVirtualizer, scrollToPreviousUserMessage]
  );

  const showLoader = loading && conversationRows.length === 0;
  const showEmptyState = !loading && conversationRows.length === 0;

  const { virtualItems, totalSize, measureElement } = conversationVirtualizer;

  useEffect(() => {
    return () => {
      clearPendingInteractionAnchor();
    };
  }, [clearPendingInteractionAnchor]);

  return (
    <ApprovalFormProvider>
      <div className="relative h-full overflow-hidden">
        {showLoader && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <SpinnerIcon className="size-6 animate-spin text-low" />
          </div>
        )}
        <div
          ref={tanstackScrollRef}
          className="h-full overflow-y-auto scrollbar-none"
          onClickCapture={handleConversationClickCapture}
        >
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

          {showEmptyState && (
            <div className="flex min-h-full items-center justify-center px-double py-12">
              <ChatEmptyState
                title={t('conversation.emptyTitle', {
                  defaultValue: 'Send a message to start the conversation.',
                })}
                description={t('conversation.emptyDescription', {
                  defaultValue:
                    'Your workspace conversation will appear here once a new turn starts.',
                })}
              />
            </div>
          )}

          {virtualizedRows.length > 0 && (
            <div
              style={{
                height: `${totalSize}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualItem) => {
                const row = virtualizedRows[virtualItem.index];
                if (!row) return null;
                return (
                  <div
                    key={row.semanticKey}
                    data-index={virtualItem.index}
                    data-row-index={virtualItem.index}
                    ref={measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {renderRowContent(row.entry, attempt, resetAction, repos)}
                  </div>
                );
              })}
            </div>
          )}

          {unvirtualizedTailRows.map((row, tailIndex) => {
            const rowIndex = firstUnvirtualizedRowIndex + tailIndex;
            return (
              <div key={row.semanticKey} data-row-index={rowIndex}>
                {renderRowContent(row.entry, attempt, resetAction, repos)}
              </div>
            );
          })}

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
