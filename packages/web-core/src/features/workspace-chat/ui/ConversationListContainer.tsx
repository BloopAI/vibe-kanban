import {
  DataWithScrollModifier,
  type ListScrollLocation,
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';

import { cn } from '@/shared/lib/utils';
import {
  INITIAL_TOP_ITEM,
  InitialDataScrollModifier,
  ScrollToBottomModifier,
} from '@/shared/lib/virtuoso-modifiers';
import NewDisplayConversationEntry from './NewDisplayConversationEntry';
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
import type { ExecutionProcess, RepoWithTargetBranch } from 'shared/types';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { ChatScriptPlaceholder } from '@vibe/ui/components/ChatScriptPlaceholder';
import { ScriptFixerDialog } from '@/shared/dialogs/scripts/ScriptFixerDialog';
import {
  getExecutionProcessesFirstConversationAt,
  getExecutionProcessesFirstSnapshotSummary,
  getExecutionProcessesFirstVisibleAt,
  getExecutionProcessesStreamConnectedAt,
  getExecutionProcessesStreamReadyAt,
  getHistoryInitialLoadDoneAt,
  getHistoryInitialLoadStartAt,
  getHistoryRemainingBatchesDoneAt,
  getWorkspaceDataReadyAt,
  getWorkspaceSessionsReadyAt,
  getWorkspaceViewEnteredAt,
} from '@/shared/lib/workspaceViewTiming';

interface ConversationListProps {
  attempt: WorkspaceWithSession;
  onAtBottomChange?: (atBottom: boolean) => void;
}

export interface ConversationListHandle {
  scrollToPreviousUserMessage: () => void;
  scrollToBottom: () => void;
}

interface MessageListContext {
  attempt: WorkspaceWithSession;
  onConfigureSetup: (() => void) | undefined;
  onConfigureCleanup: (() => void) | undefined;
  showSetupPlaceholder: boolean;
  showCleanupPlaceholder: boolean;
  resetAction: UseResetProcessResult;
}

interface TimingMilestones {
  workspaceRouteEnteredAtMs?: number;
  workspaceDataReadyAtMs?: number;
  workspaceSessionsReadyAtMs?: number;
  executionProcessesStreamConnectedAtMs?: number;
  executionProcessesStreamReadyAtMs?: number;
  executionProcessesFirstVisibleAtMs?: number;
  executionProcessesFirstConversationAtMs?: number;
  historyInitialLoadStartAtMs?: number;
  historyInitialLoadDoneAtMs?: number;
  historyRemainingBatchesDoneAtMs?: number;
  firstEntriesUpdatedAtMs?: number;
  firstNonEmptyEntriesUpdatedAtMs?: number;
  firstMeaningfulLogEntryAtMs?: number;
  firstLoadingFalseEntriesUpdatedAtMs?: number;
  firstDebounceFiredAtMs?: number;
  firstChannelDataCommittedAtMs?: number;
  firstPaintAfterContentAtMs?: number;
}

interface TimingDurations {
  routeToConversationMountMs?: number;
  routeToWorkspaceDataReadyMs?: number;
  routeToWorkspaceSessionsReadyMs?: number;
  routeToExecutionProcessesStreamConnectedMs?: number;
  routeToExecutionProcessesStreamReadyMs?: number;
  routeToExecutionProcessesFirstVisibleMs?: number;
  routeToExecutionProcessesFirstConversationMs?: number;
  routeToHistoryInitialLoadStartMs?: number;
  routeToHistoryInitialLoadDoneMs?: number;
  routeToHistoryRemainingBatchesDoneMs?: number;
  routeToFirstNonEmptyEntriesMs?: number;
  routeToFirstMeaningfulLogEntryMs?: number;
  routeToFirstLoadingFalseEntriesMs?: number;
  routeToFirstPaintMs?: number;
  mountToFirstEntriesMs?: number;
  mountToFirstNonEmptyEntriesMs?: number;
  mountToFirstMeaningfulLogEntryMs?: number;
  mountToFirstLoadingFalseEntriesMs?: number;
  mountToFirstCommitMs?: number;
  mountToFirstPaintMs?: number;
}

interface QueueDelayMetric {
  valueMs: number;
  addType: AddEntryType;
  entriesLen: number;
}

interface AggregateMetric {
  valueMs: number;
  entriesLen: number;
}

interface TimingAnomaly {
  type: 'queue_delay' | 'aggregate';
  valueMs: number;
  addType?: AddEntryType;
  entriesLen: number;
}

interface ConversationListTimingSnapshot {
  attemptId: string;
  sessionId?: string;
  startedAtMs: number;
  milestones: TimingMilestones;
  durations: TimingDurations;
  diagnostics: {
    executionProcessesFirstSnapshotByRunReason?: Partial<
      Record<ExecutionProcess['run_reason'], number>
    >;
    executionProcessesFirstSnapshotVisibleByRunReason?: Partial<
      Record<ExecutionProcess['run_reason'], number>
    >;
    executionProcessesFirstSnapshotDroppedCount?: number;
  };
  counters: {
    entriesUpdatedCalls: number;
    debounceCleared: number;
  };
  slowest: {
    maxQueueDelayMs?: QueueDelayMetric;
    maxAggregateMs?: AggregateMetric;
  };
  anomalies: TimingAnomaly[];
}

type ConversationTimingWindow = Window &
  typeof globalThis & {
    __vkEnableConversationTiming?: boolean;
    __vkConversationTimings?: Record<string, ConversationListTimingSnapshot>;
  };

const QUEUE_DELAY_ANOMALY_MS = 300;
const AGGREGATE_ANOMALY_MS = 50;
const MAX_TIMING_ANOMALIES = 3;

const getNowMs = (): number => performance.now();

const getTimingWindow = (): ConversationTimingWindow | null => {
  if (typeof window === 'undefined') return null;
  return window as ConversationTimingWindow;
};

const createConversationTiming = (
  attemptId: string,
  sessionId?: string
): ConversationListTimingSnapshot => {
  const workspaceRouteEnteredAtMs = getWorkspaceViewEnteredAt(attemptId);
  const workspaceDataReadyAtMs = getWorkspaceDataReadyAt(attemptId);
  const workspaceSessionsReadyAtMs = getWorkspaceSessionsReadyAt(attemptId);
  const executionProcessesStreamConnectedAtMs =
    getExecutionProcessesStreamConnectedAt(sessionId);
  const executionProcessesStreamReadyAtMs =
    getExecutionProcessesStreamReadyAt(sessionId);
  const executionProcessesFirstVisibleAtMs =
    getExecutionProcessesFirstVisibleAt(sessionId);
  const executionProcessesFirstConversationAtMs =
    getExecutionProcessesFirstConversationAt(sessionId);
  const executionProcessesFirstSnapshotSummary =
    getExecutionProcessesFirstSnapshotSummary(sessionId);
  const historyInitialLoadStartAtMs = getHistoryInitialLoadStartAt(attemptId);
  const historyInitialLoadDoneAtMs = getHistoryInitialLoadDoneAt(attemptId);
  const historyRemainingBatchesDoneAtMs =
    getHistoryRemainingBatchesDoneAt(attemptId);

  return {
    attemptId,
    sessionId,
    startedAtMs: getNowMs(),
    milestones: {
      workspaceRouteEnteredAtMs,
      workspaceDataReadyAtMs,
      workspaceSessionsReadyAtMs,
      executionProcessesStreamConnectedAtMs,
      executionProcessesStreamReadyAtMs,
      executionProcessesFirstVisibleAtMs,
      executionProcessesFirstConversationAtMs,
      historyInitialLoadStartAtMs,
      historyInitialLoadDoneAtMs,
      historyRemainingBatchesDoneAtMs,
    },
    durations: {},
    diagnostics: {
      executionProcessesFirstSnapshotByRunReason:
        executionProcessesFirstSnapshotSummary?.byRunReason,
      executionProcessesFirstSnapshotVisibleByRunReason:
        executionProcessesFirstSnapshotSummary?.visibleByRunReason,
      executionProcessesFirstSnapshotDroppedCount:
        executionProcessesFirstSnapshotSummary?.droppedCount,
    },
    counters: {
      entriesUpdatedCalls: 0,
      debounceCleared: 0,
    },
    slowest: {},
    anomalies: [],
  };
};

const updateTimingDurations = (timing: ConversationListTimingSnapshot) => {
  timing.durations.routeToWorkspaceDataReadyMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.workspaceDataReadyAtMs != null
      ? Math.max(
          0,
          timing.milestones.workspaceDataReadyAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToWorkspaceSessionsReadyMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.workspaceSessionsReadyAtMs != null
      ? Math.max(
          0,
          timing.milestones.workspaceSessionsReadyAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToExecutionProcessesStreamConnectedMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.executionProcessesStreamConnectedAtMs != null
      ? Math.max(
          0,
          timing.milestones.executionProcessesStreamConnectedAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToExecutionProcessesStreamReadyMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.executionProcessesStreamReadyAtMs != null
      ? Math.max(
          0,
          timing.milestones.executionProcessesStreamReadyAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToExecutionProcessesFirstVisibleMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.executionProcessesFirstVisibleAtMs != null
      ? Math.max(
          0,
          timing.milestones.executionProcessesFirstVisibleAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToExecutionProcessesFirstConversationMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.executionProcessesFirstConversationAtMs != null
      ? Math.max(
          0,
          timing.milestones.executionProcessesFirstConversationAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToHistoryInitialLoadStartMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.historyInitialLoadStartAtMs != null
      ? Math.max(
          0,
          timing.milestones.historyInitialLoadStartAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToHistoryInitialLoadDoneMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.historyInitialLoadDoneAtMs != null
      ? Math.max(
          0,
          timing.milestones.historyInitialLoadDoneAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToHistoryRemainingBatchesDoneMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.historyRemainingBatchesDoneAtMs != null
      ? Math.max(
          0,
          timing.milestones.historyRemainingBatchesDoneAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToConversationMountMs =
    timing.milestones.workspaceRouteEnteredAtMs != null
      ? Math.max(
          0,
          timing.startedAtMs - timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToFirstPaintMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.firstPaintAfterContentAtMs != null
      ? Math.max(
          0,
          timing.milestones.firstPaintAfterContentAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToFirstNonEmptyEntriesMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.firstNonEmptyEntriesUpdatedAtMs != null
      ? Math.max(
          0,
          timing.milestones.firstNonEmptyEntriesUpdatedAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToFirstMeaningfulLogEntryMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.firstMeaningfulLogEntryAtMs != null
      ? Math.max(
          0,
          timing.milestones.firstMeaningfulLogEntryAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.routeToFirstLoadingFalseEntriesMs =
    timing.milestones.workspaceRouteEnteredAtMs != null &&
    timing.milestones.firstLoadingFalseEntriesUpdatedAtMs != null
      ? Math.max(
          0,
          timing.milestones.firstLoadingFalseEntriesUpdatedAtMs -
            timing.milestones.workspaceRouteEnteredAtMs
        )
      : undefined;
  timing.durations.mountToFirstEntriesMs =
    timing.milestones.firstEntriesUpdatedAtMs != null
      ? timing.milestones.firstEntriesUpdatedAtMs - timing.startedAtMs
      : undefined;
  timing.durations.mountToFirstNonEmptyEntriesMs =
    timing.milestones.firstNonEmptyEntriesUpdatedAtMs != null
      ? timing.milestones.firstNonEmptyEntriesUpdatedAtMs - timing.startedAtMs
      : undefined;
  timing.durations.mountToFirstMeaningfulLogEntryMs =
    timing.milestones.firstMeaningfulLogEntryAtMs != null
      ? timing.milestones.firstMeaningfulLogEntryAtMs - timing.startedAtMs
      : undefined;
  timing.durations.mountToFirstLoadingFalseEntriesMs =
    timing.milestones.firstLoadingFalseEntriesUpdatedAtMs != null
      ? timing.milestones.firstLoadingFalseEntriesUpdatedAtMs -
        timing.startedAtMs
      : undefined;
  timing.durations.mountToFirstCommitMs =
    timing.milestones.firstChannelDataCommittedAtMs != null
      ? timing.milestones.firstChannelDataCommittedAtMs - timing.startedAtMs
      : undefined;
  timing.durations.mountToFirstPaintMs =
    timing.milestones.firstPaintAfterContentAtMs != null
      ? timing.milestones.firstPaintAfterContentAtMs - timing.startedAtMs
      : undefined;
};

const maybePopulateWorkspaceMilestones = (
  timing: ConversationListTimingSnapshot
) => {
  let changed = false;

  if (timing.milestones.workspaceRouteEnteredAtMs == null) {
    const workspaceRouteEnteredAtMs = getWorkspaceViewEnteredAt(
      timing.attemptId
    );
    if (workspaceRouteEnteredAtMs != null) {
      timing.milestones.workspaceRouteEnteredAtMs = workspaceRouteEnteredAtMs;
      changed = true;
    }
  }

  if (timing.milestones.workspaceDataReadyAtMs == null) {
    const workspaceDataReadyAtMs = getWorkspaceDataReadyAt(timing.attemptId);
    if (workspaceDataReadyAtMs != null) {
      timing.milestones.workspaceDataReadyAtMs = workspaceDataReadyAtMs;
      changed = true;
    }
  }

  if (timing.milestones.workspaceSessionsReadyAtMs == null) {
    const workspaceSessionsReadyAtMs = getWorkspaceSessionsReadyAt(
      timing.attemptId
    );
    if (workspaceSessionsReadyAtMs != null) {
      timing.milestones.workspaceSessionsReadyAtMs = workspaceSessionsReadyAtMs;
      changed = true;
    }
  }

  if (
    timing.sessionId &&
    timing.milestones.executionProcessesStreamConnectedAtMs == null
  ) {
    const executionProcessesStreamConnectedAtMs =
      getExecutionProcessesStreamConnectedAt(timing.sessionId);
    if (executionProcessesStreamConnectedAtMs != null) {
      timing.milestones.executionProcessesStreamConnectedAtMs =
        executionProcessesStreamConnectedAtMs;
      changed = true;
    }
  }

  if (
    timing.sessionId &&
    timing.milestones.executionProcessesStreamReadyAtMs == null
  ) {
    const executionProcessesStreamReadyAtMs =
      getExecutionProcessesStreamReadyAt(timing.sessionId);
    if (executionProcessesStreamReadyAtMs != null) {
      timing.milestones.executionProcessesStreamReadyAtMs =
        executionProcessesStreamReadyAtMs;
      changed = true;
    }
  }

  if (
    timing.sessionId &&
    timing.milestones.executionProcessesFirstVisibleAtMs == null
  ) {
    const executionProcessesFirstVisibleAtMs =
      getExecutionProcessesFirstVisibleAt(timing.sessionId);
    if (executionProcessesFirstVisibleAtMs != null) {
      timing.milestones.executionProcessesFirstVisibleAtMs =
        executionProcessesFirstVisibleAtMs;
      changed = true;
    }
  }

  if (
    timing.sessionId &&
    timing.milestones.executionProcessesFirstConversationAtMs == null
  ) {
    const executionProcessesFirstConversationAtMs =
      getExecutionProcessesFirstConversationAt(timing.sessionId);
    if (executionProcessesFirstConversationAtMs != null) {
      timing.milestones.executionProcessesFirstConversationAtMs =
        executionProcessesFirstConversationAtMs;
      changed = true;
    }
  }

  if (
    timing.sessionId &&
    (timing.diagnostics.executionProcessesFirstSnapshotByRunReason == null ||
      timing.diagnostics.executionProcessesFirstSnapshotVisibleByRunReason ==
        null ||
      timing.diagnostics.executionProcessesFirstSnapshotDroppedCount == null)
  ) {
    const executionProcessesFirstSnapshotSummary =
      getExecutionProcessesFirstSnapshotSummary(timing.sessionId);
    if (executionProcessesFirstSnapshotSummary) {
      timing.diagnostics.executionProcessesFirstSnapshotByRunReason =
        executionProcessesFirstSnapshotSummary.byRunReason;
      timing.diagnostics.executionProcessesFirstSnapshotVisibleByRunReason =
        executionProcessesFirstSnapshotSummary.visibleByRunReason;
      timing.diagnostics.executionProcessesFirstSnapshotDroppedCount =
        executionProcessesFirstSnapshotSummary.droppedCount;
      changed = true;
    }
  }

  if (timing.milestones.historyInitialLoadStartAtMs == null) {
    const historyInitialLoadStartAtMs = getHistoryInitialLoadStartAt(
      timing.attemptId
    );
    if (historyInitialLoadStartAtMs != null) {
      timing.milestones.historyInitialLoadStartAtMs =
        historyInitialLoadStartAtMs;
      changed = true;
    }
  }

  if (timing.milestones.historyInitialLoadDoneAtMs == null) {
    const historyInitialLoadDoneAtMs = getHistoryInitialLoadDoneAt(
      timing.attemptId
    );
    if (historyInitialLoadDoneAtMs != null) {
      timing.milestones.historyInitialLoadDoneAtMs = historyInitialLoadDoneAtMs;
      changed = true;
    }
  }

  if (timing.milestones.historyRemainingBatchesDoneAtMs == null) {
    const historyRemainingBatchesDoneAtMs = getHistoryRemainingBatchesDoneAt(
      timing.attemptId
    );
    if (historyRemainingBatchesDoneAtMs != null) {
      timing.milestones.historyRemainingBatchesDoneAtMs =
        historyRemainingBatchesDoneAtMs;
      changed = true;
    }
  }

  if (changed) {
    updateTimingDurations(timing);
  }
};

const isMeaningfulLogEntry = (entry: PatchTypeWithKey): boolean => {
  if (entry.type !== 'NORMALIZED_ENTRY') return true;

  return (
    entry.content.entry_type.type !== 'next_action' &&
    entry.content.entry_type.type !== 'loading'
  );
};

const setTimingMilestone = <K extends keyof TimingMilestones>(
  timing: ConversationListTimingSnapshot,
  key: K,
  atMs: number
) => {
  if (timing.milestones[key] != null) return;
  timing.milestones[key] = atMs;
  updateTimingDurations(timing);
};

const pushTimingAnomaly = (
  timing: ConversationListTimingSnapshot,
  anomaly: TimingAnomaly
) => {
  if (timing.anomalies.length >= MAX_TIMING_ANOMALIES) return;
  timing.anomalies.push(anomaly);
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
  const resetAction = context?.resetAction;

  // Handle aggregated tool groups (file_read, search, web_fetch)
  if (isAggregatedGroup(data)) {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        aggregatedGroup={data}
        aggregatedDiffGroup={null}
        aggregatedThinkingGroup={null}
        entry={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        resetAction={resetAction}
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
        aggregatedThinkingGroup={null}
        entry={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        resetAction={resetAction}
      />
    );
  }

  // Handle aggregated thinking groups (thinking entries in previous turns)
  if (isAggregatedThinkingGroup(data)) {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        aggregatedGroup={null}
        aggregatedDiffGroup={null}
        aggregatedThinkingGroup={data}
        entry={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        resetAction={resetAction}
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
        aggregatedThinkingGroup={null}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        resetAction={resetAction}
      />
    );
  }

  return null;
};

const computeItemKey: VirtuosoMessageListProps<
  DisplayEntry,
  MessageListContext
>['computeItemKey'] = ({ data }) => `conv-${data.patchKey}`;

const itemIdentity: VirtuosoMessageListProps<
  DisplayEntry,
  MessageListContext
>['itemIdentity'] = (item) => item.patchKey;

export const ConversationList = forwardRef<
  ConversationListHandle,
  ConversationListProps
>(function ConversationList({ attempt, onAtBottomChange }, ref) {
  const resetAction = useResetProcess();
  const [channelData, setChannelData] =
    useState<DataWithScrollModifier<DisplayEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const { setEntries, reset } = useEntries();
  const pendingUpdateRef = useRef<{
    entries: PatchTypeWithKey[];
    addType: AddEntryType;
    loading: boolean;
    scheduledAtMs: number;
  } | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timingRef = useRef<ConversationListTimingSnapshot | null>(null);

  const lastAtBottomRef = useRef(true);
  const handleScroll = useCallback(
    (location: ListScrollLocation) => {
      if (location.isAtBottom !== lastAtBottomRef.current) {
        lastAtBottomRef.current = location.isAtBottom;
        onAtBottomChange?.(location.isAtBottom);
      }
    },
    [onAtBottomChange]
  );

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
  const attemptSessionId = attempt.session?.id;

  useEffect(() => {
    setLoading(true);
    setChannelData(null);
    reset();

    const timingWindow = getTimingWindow();
    const timingEnabled =
      timingWindow &&
      (timingWindow.__vkEnableConversationTiming ?? import.meta.env.DEV);
    if (!timingEnabled || !timingWindow) {
      timingRef.current = null;
      return;
    }

    const timing = createConversationTiming(attempt.id, attemptSessionId);
    timingWindow.__vkConversationTimings ??= {};
    timingWindow.__vkConversationTimings[attempt.id] = timing;
    timingRef.current = timing;
  }, [attempt.id, attemptSessionId, reset]);

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
    const receivedAtMs = getNowMs();
    const timing = timingRef.current;
    if (timing) {
      maybePopulateWorkspaceMilestones(timing);
      timing.counters.entriesUpdatedCalls += 1;
      setTimingMilestone(timing, 'firstEntriesUpdatedAtMs', receivedAtMs);
      if (newEntries.length > 0) {
        setTimingMilestone(
          timing,
          'firstNonEmptyEntriesUpdatedAtMs',
          receivedAtMs
        );
        if (newEntries.some(isMeaningfulLogEntry)) {
          setTimingMilestone(
            timing,
            'firstMeaningfulLogEntryAtMs',
            receivedAtMs
          );
        }
      }
      if (!newLoading) {
        setTimingMilestone(
          timing,
          'firstLoadingFalseEntriesUpdatedAtMs',
          receivedAtMs
        );
      }
    }

    pendingUpdateRef.current = {
      entries: newEntries,
      addType,
      loading: newLoading,
      scheduledAtMs: receivedAtMs,
    };

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      if (timing) {
        timing.counters.debounceCleared += 1;
      }
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const pending = pendingUpdateRef.current;
      if (!pending) return;
      const activeTiming = timingRef.current;
      const debounceFiredAtMs = getNowMs();
      const queueDelayMs = debounceFiredAtMs - pending.scheduledAtMs;
      if (activeTiming) {
        setTimingMilestone(
          activeTiming,
          'firstDebounceFiredAtMs',
          debounceFiredAtMs
        );
        if (
          !activeTiming.slowest.maxQueueDelayMs ||
          queueDelayMs > activeTiming.slowest.maxQueueDelayMs.valueMs
        ) {
          activeTiming.slowest.maxQueueDelayMs = {
            valueMs: queueDelayMs,
            addType: pending.addType,
            entriesLen: pending.entries.length,
          };
        }
        if (queueDelayMs > QUEUE_DELAY_ANOMALY_MS) {
          pushTimingAnomaly(activeTiming, {
            type: 'queue_delay',
            valueMs: queueDelayMs,
            addType: pending.addType,
            entriesLen: pending.entries.length,
          });
        }
      }

      let scrollModifier: ScrollModifier;

      if (loading) {
        // First data load: purge estimated sizes and jump to bottom
        scrollModifier = InitialDataScrollModifier;
      } else if (pending.addType === 'plan') {
        scrollModifier = ScrollToTopOfLastItem;
      } else if (pending.addType === 'running') {
        scrollModifier = AutoScrollToBottom;
      } else {
        // Historic/subsequent updates: scroll to bottom but keep measured sizes
        scrollModifier = ScrollToBottomModifier;
      }

      const aggregateStartAtMs = getNowMs();
      const aggregatedEntries = aggregateConsecutiveEntries(pending.entries);
      const aggregateMs = getNowMs() - aggregateStartAtMs;
      if (activeTiming) {
        if (
          !activeTiming.slowest.maxAggregateMs ||
          aggregateMs > activeTiming.slowest.maxAggregateMs.valueMs
        ) {
          activeTiming.slowest.maxAggregateMs = {
            valueMs: aggregateMs,
            entriesLen: pending.entries.length,
          };
        }
        if (aggregateMs > AGGREGATE_ANOMALY_MS) {
          pushTimingAnomaly(activeTiming, {
            type: 'aggregate',
            valueMs: aggregateMs,
            entriesLen: pending.entries.length,
          });
        }
      }

      setChannelData({ data: aggregatedEntries, scrollModifier });
      setEntries(pending.entries);

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
  const entries = channelData?.data ?? [];
  const hasEntries = entries.length > 0;

  // Show placeholders only if script not configured AND not already run AND first turn
  const showSetupPlaceholder =
    !hasSetupScript && !hasSetupScriptRun && hasEntries;
  const showCleanupPlaceholder =
    !hasCleanupScript &&
    !hasCleanupScriptRun &&
    !hasRunningProcess &&
    hasEntries &&
    isFirstTurn;

  const messageListRef = useRef<VirtuosoMessageListMethods | null>(null);
  const messageListContext = useMemo(
    () => ({
      attempt,
      onConfigureSetup: canConfigure ? handleConfigureSetup : undefined,
      onConfigureCleanup: canConfigure ? handleConfigureCleanup : undefined,
      showSetupPlaceholder,
      showCleanupPlaceholder,
      resetAction,
    }),
    [
      attempt,
      canConfigure,
      handleConfigureSetup,
      handleConfigureCleanup,
      showSetupPlaceholder,
      showCleanupPlaceholder,
      resetAction,
    ]
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

  useLayoutEffect(() => {
    if (!channelData) return;
    const timing = timingRef.current;
    if (!timing) return;

    maybePopulateWorkspaceMilestones(timing);
    setTimingMilestone(timing, 'firstChannelDataCommittedAtMs', getNowMs());
  }, [channelData]);

  useEffect(() => {
    if (!hasContent) return;
    const timing = timingRef.current;
    if (!timing || timing.milestones.firstPaintAfterContentAtMs != null) return;

    const rafId = requestAnimationFrame(() => {
      const activeTiming = timingRef.current;
      if (!activeTiming) return;

      maybePopulateWorkspaceMilestones(activeTiming);
      setTimingMilestone(
        activeTiming,
        'firstPaintAfterContentAtMs',
        getNowMs()
      );
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [hasContent]);

  return (
    <ApprovalFormProvider>
      <div
        className={cn(
          'virtuoso-license-wrapper relative h-full overflow-hidden transition-opacity duration-300',
          hasContent ? 'opacity-100' : 'opacity-0'
        )}
      >
        {!hasContent && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <SpinnerIcon className="size-6 animate-spin text-low" />
          </div>
        )}
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
            itemIdentity={itemIdentity}
            ItemContent={ItemContent}
            onScroll={handleScroll}
            Header={({ context }) => (
              <div className="pt-2">
                {context?.showSetupPlaceholder && (
                  <div className="my-base px-double">
                    <ChatScriptPlaceholder
                      type="setup"
                      onConfigure={context.onConfigureSetup}
                    />
                  </div>
                )}
              </div>
            )}
            Footer={({ context }) => (
              <div className="pb-2">
                {context?.showCleanupPlaceholder && (
                  <div className="my-base px-double">
                    <ChatScriptPlaceholder
                      type="cleanup"
                      onConfigure={context.onConfigureCleanup}
                    />
                  </div>
                )}
              </div>
            )}
          />
        </VirtuosoMessageListLicense>
      </div>
    </ApprovalFormProvider>
  );
});

export default ConversationList;
