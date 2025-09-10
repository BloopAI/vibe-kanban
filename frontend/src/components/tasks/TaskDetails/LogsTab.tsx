import {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useReducer,
  useState,
} from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Cog } from 'lucide-react';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import { useProcessesLogs } from '@/hooks/useProcessesLogs';
import ProcessGroup from '@/components/logs/ProcessGroup';
import {
  shouldShowInLogs,
  isAutoCollapsibleProcess,
  isProcessCompleted,
  isCodingAgent,
  getLatestCodingAgent,
  PROCESS_STATUSES,
  PROCESS_RUN_REASONS,
} from '@/constants/processes';
import type { ExecutionProcessStatus, TaskAttempt } from 'shared/types';
import type { UnifiedLogEntry, ProcessStartPayload } from '@/types/logs';
import { showModal } from '@/lib/modals';

function addAll<T>(set: Set<T>, items: T[]): Set<T> {
  items.forEach((i: T) => set.add(i));
  return set;
}

// State management types
type LogsState = {
  userCollapsed: Set<string>;
  autoCollapsed: Set<string>;
  prevStatus: Map<string, ExecutionProcessStatus>;
  prevLatestAgent?: string;
};

type LogsAction =
  | { type: 'RESET_ATTEMPT' }
  | { type: 'TOGGLE_USER'; id: string }
  | { type: 'AUTO_COLLAPSE'; ids: string[] }
  | { type: 'AUTO_EXPAND'; ids: string[] }
  | { type: 'UPDATE_STATUS'; id: string; status: ExecutionProcessStatus }
  | { type: 'NEW_RUNNING_AGENT'; id: string };

const initialState: LogsState = {
  userCollapsed: new Set(),
  autoCollapsed: new Set(),
  prevStatus: new Map(),
  prevLatestAgent: undefined,
};

function reducer(state: LogsState, action: LogsAction): LogsState {
  switch (action.type) {
    case 'RESET_ATTEMPT':
      return { ...initialState };

    case 'TOGGLE_USER': {
      const newUserCollapsed = new Set(state.userCollapsed);
      const newAutoCollapsed = new Set(state.autoCollapsed);

      const isCurrentlyCollapsed =
        newUserCollapsed.has(action.id) || newAutoCollapsed.has(action.id);

      if (isCurrentlyCollapsed) {
        // we want to EXPAND
        newUserCollapsed.delete(action.id);
        newAutoCollapsed.delete(action.id);
      } else {
        // we want to COLLAPSE
        newUserCollapsed.add(action.id);
      }

      return {
        ...state,
        userCollapsed: newUserCollapsed,
        autoCollapsed: newAutoCollapsed,
      };
    }

    case 'AUTO_COLLAPSE': {
      const newAutoCollapsed = new Set(state.autoCollapsed);
      addAll(newAutoCollapsed, action.ids);
      return {
        ...state,
        autoCollapsed: newAutoCollapsed,
      };
    }

    case 'AUTO_EXPAND': {
      const newAutoCollapsed = new Set(state.autoCollapsed);
      action.ids.forEach((id) => newAutoCollapsed.delete(id));
      return {
        ...state,
        autoCollapsed: newAutoCollapsed,
      };
    }

    case 'UPDATE_STATUS': {
      const newPrevStatus = new Map(state.prevStatus);
      newPrevStatus.set(action.id, action.status);
      return {
        ...state,
        prevStatus: newPrevStatus,
      };
    }

    case 'NEW_RUNNING_AGENT':
      return {
        ...state,
        prevLatestAgent: action.id,
      };

    default:
      return state;
  }
}

type Props = {
  selectedAttempt: TaskAttempt | null;
};

function LogsTab({ selectedAttempt }: Props) {
  const { attemptData, refetch } = useAttemptExecution(selectedAttempt?.id);
  const { data: branchStatus, refetch: refetchBranch } = useBranchStatus(
    selectedAttempt?.id
  );
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const [state, dispatch] = useReducer(reducer, initialState);

  // Filter out dev server processes before passing to useProcessesLogs
  const filteredProcesses = useMemo(() => {
    const processes = attemptData.processes || [];
    return processes.filter(
      (process) => shouldShowInLogs(process.run_reason) && !process.dropped
    );
  }, [
    attemptData.processes
      ?.map((p) => `${p.id}:${p.status}:${p.dropped}`)
      .join(','),
  ]);

  // Detect if any process is running
  const anyRunning = useMemo(
    () => (attemptData.processes || []).some((p) => p.status === 'running'),
    [attemptData.processes?.map((p) => p.status).join(',')]
  );

  const { entries } = useProcessesLogs(filteredProcesses, true);
  const [restoreBusy, setRestoreBusy] = useState(false);

  // Combined collapsed processes (auto + user)
  const allCollapsedProcesses = useMemo(() => {
    const combined = new Set(state.autoCollapsed);
    state.userCollapsed.forEach((id: string) => combined.add(id));
    return combined;
  }, [state.autoCollapsed, state.userCollapsed]);

  // Toggle collapsed state for a process (user action)
  const toggleProcessCollapse = useCallback((processId: string) => {
    dispatch({ type: 'TOGGLE_USER', id: processId });
  }, []);

  // Effect #1: Reset state when attempt changes
  useEffect(() => {
    dispatch({ type: 'RESET_ATTEMPT' });
  }, [selectedAttempt?.id]);

  // Effect #2: Handle setup/cleanup script auto-collapse and auto-expand
  useEffect(() => {
    const toCollapse: string[] = [];
    const toExpand: string[] = [];

    filteredProcesses.forEach((process) => {
      if (isAutoCollapsibleProcess(process.run_reason)) {
        const prevStatus = state.prevStatus.get(process.id);
        const currentStatus = process.status;

        // Auto-collapse completed setup/cleanup scripts
        const shouldAutoCollapse =
          (prevStatus === PROCESS_STATUSES.RUNNING ||
            prevStatus === undefined) &&
          isProcessCompleted(currentStatus) &&
          !state.userCollapsed.has(process.id) &&
          !state.autoCollapsed.has(process.id);

        if (shouldAutoCollapse) {
          toCollapse.push(process.id);
        }

        // Auto-expand scripts that restart after completion
        const becameRunningAgain =
          prevStatus &&
          isProcessCompleted(prevStatus) &&
          currentStatus === PROCESS_STATUSES.RUNNING &&
          state.autoCollapsed.has(process.id);

        if (becameRunningAgain) {
          toExpand.push(process.id);
        }

        // Update status tracking
        dispatch({
          type: 'UPDATE_STATUS',
          id: process.id,
          status: currentStatus,
        });
      }
    });

    if (toCollapse.length > 0) {
      dispatch({ type: 'AUTO_COLLAPSE', ids: toCollapse });
    }

    if (toExpand.length > 0) {
      dispatch({ type: 'AUTO_EXPAND', ids: toExpand });
    }
  }, [filteredProcesses, state.userCollapsed, state.autoCollapsed]);

  // Effect #3: Handle coding agent succession logic
  useEffect(() => {
    const latestCodingAgentId = getLatestCodingAgent(filteredProcesses);
    if (!latestCodingAgentId) return;

    // Collapse previous agents when a new latest agent appears
    if (latestCodingAgentId !== state.prevLatestAgent) {
      // Collapse all other coding agents that aren't user-collapsed
      const toCollapse = filteredProcesses
        .filter(
          (p) =>
            isCodingAgent(p.run_reason) &&
            p.id !== latestCodingAgentId &&
            !state.userCollapsed.has(p.id) &&
            !state.autoCollapsed.has(p.id)
        )
        .map((p) => p.id);

      if (toCollapse.length > 0) {
        dispatch({ type: 'AUTO_COLLAPSE', ids: toCollapse });
      }

      dispatch({ type: 'NEW_RUNNING_AGENT', id: latestCodingAgentId });
    }
  }, [
    filteredProcesses,
    state.prevLatestAgent,
    state.userCollapsed,
    state.autoCollapsed,
  ]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { header?: ProcessStartPayload; entries: UnifiedLogEntry[] }
    >();

    filteredProcesses.forEach((p) => {
      map.set(p.id, { header: undefined, entries: [] });
    });

    entries.forEach((e: UnifiedLogEntry) => {
      const bucket = map.get(e.processId);
      if (!bucket) return;

      if (e.channel === 'process_start') {
        bucket.header = e.payload as ProcessStartPayload;
        return;
      }

      // Always store entries; whether they show is decided by group collapse
      bucket.entries.push(e);
    });

    return filteredProcesses
      .map((p) => ({
        processId: p.id,
        ...(map.get(p.id) || { entries: [] }),
      }))
      .filter((g) => g.header) as Array<{
      processId: string;
      header: ProcessStartPayload;
      entries: UnifiedLogEntry[];
    }>;
  }, [filteredProcesses, entries]);

  const itemContent = useCallback(
    (
      _index: number,
      group: {
        processId: string;
        header: ProcessStartPayload;
        entries: UnifiedLogEntry[];
      }
    ) =>
      (() => {
        // Compute retry props (replaces restore)
        let retry:
          | {
              onRetry: (pid: string, newPrompt: string) => void;
              retryProcessId?: string;
              retryDisabled?: boolean;
              retryDisabledReason?: string;
            }
          | undefined;

        {
          const proc = (attemptData.processes || []).find(
            (p) => p.id === group.processId
          );
          const isRunningProc = proc?.status === 'running';
          const isCoding = proc?.run_reason === 'codingagent';
          // Always show for coding agent processes
          const shouldShow = !!isCoding;

          if (shouldShow) {
            const disabled = anyRunning || restoreBusy || isRunningProc;
            let disabledReason: string | undefined;
            if (isRunningProc)
              disabledReason = 'Finish or stop this run to retry.';
            else if (anyRunning)
              disabledReason = 'Cannot retry while a process is running.';
            else if (restoreBusy) disabledReason = 'Retry in progress.';

            retry = {
              retryProcessId: group.processId,
              retryDisabled: disabled,
              retryDisabledReason: disabledReason,
              onRetry: async (pid: string, newPrompt: string) => {
                const p2 = (attemptData.processes || []).find(
                  (p) => p.id === pid
                );
                type WithBefore = { before_head_commit?: string | null };
                const before =
                  (p2 as WithBefore | undefined)?.before_head_commit || null;
                let targetSubject = null;
                let commitsToReset = null;
                let isLinear = null;

                if (before && selectedAttempt?.id) {
                  try {
                    const { commitsApi } = await import('@/lib/api');
                    const info = await commitsApi.getInfo(
                      selectedAttempt.id,
                      before
                    );
                    targetSubject = info.subject;
                    const cmp = await commitsApi.compareToHead(
                      selectedAttempt.id,
                      before
                    );
                    commitsToReset = cmp.is_linear ? cmp.ahead_from_head : null;
                    isLinear = cmp.is_linear;
                  } catch {
                    /* ignore */
                  }
                }

                const head = branchStatus?.head_oid || null;
                const dirty = !!branchStatus?.has_uncommitted_changes;
                const needReset = !!(before && (before !== head || dirty));
                const canGitReset = needReset && !dirty;

                // Calculate later process counts for dialog
                const procs = (attemptData.processes || []).filter(
                  (p) => !p.dropped && shouldShowInLogs(p.run_reason)
                );
                const idx = procs.findIndex((p) => p.id === pid);
                const laterCount = idx >= 0 ? procs.length - (idx + 1) : 0;
                const later = idx >= 0 ? procs.slice(idx + 1) : [];
                const laterCoding = later.filter((p) =>
                  isCodingAgent(p.run_reason)
                ).length;
                const laterSetup = later.filter(
                  (p) => p.run_reason === PROCESS_RUN_REASONS.SETUP_SCRIPT
                ).length;
                const laterCleanup = later.filter(
                  (p) => p.run_reason === PROCESS_RUN_REASONS.CLEANUP_SCRIPT
                ).length;

                try {
                  const result = await showModal<{
                    action: 'confirmed' | 'canceled';
                    performGitReset?: boolean;
                    forceWhenDirty?: boolean;
                  }>('restore-logs', {
                    targetSha: before,
                    targetSubject,
                    commitsToReset,
                    isLinear,
                    laterCount,
                    laterCoding,
                    laterSetup,
                    laterCleanup,
                    needGitReset: needReset,
                    canGitReset,
                    hasRisk: dirty,
                    uncommittedCount: branchStatus?.uncommitted_count ?? 0,
                    untrackedCount: branchStatus?.untracked_count ?? 0,
                    // Always default to performing a worktree reset
                    initialWorktreeResetOn: true,
                    initialForceReset: false,
                  });

                  if (result.action === 'confirmed' && selectedAttempt?.id) {
                    const { attemptsApi } = await import('@/lib/api');
                    try {
                      setRestoreBusy(true);
                      // Determine variant from the original process executor profile if available
                      let variant: string | null = null;
                      const typ = p2?.executor_action?.typ;
                      if (
                        typ &&
                        (typ.type === 'CodingAgentInitialRequest' ||
                          typ.type === 'CodingAgentFollowUpRequest')
                      ) {
                        variant = typ.executor_profile_id?.variant ?? null;
                      }
                      await attemptsApi.replaceProcess(selectedAttempt.id, {
                        process_id: pid,
                        prompt: newPrompt,
                        variant,
                        perform_git_reset: result.performGitReset ?? true,
                        force_when_dirty: result.forceWhenDirty ?? false,
                      });
                      await refetch();
                      await refetchBranch();
                    } finally {
                      setRestoreBusy(false);
                    }
                  }
                } catch (error) {
                  // User cancelled - do nothing
                }
              },
            };
          }
        }

        return (
          <ProcessGroup
            header={group.header}
            entries={group.entries}
            isCollapsed={allCollapsedProcesses.has(group.processId)}
            onToggle={toggleProcessCollapse}
            retry={retry}
          />
        );
      })(),
    [
      allCollapsedProcesses,
      toggleProcessCollapse,
      anyRunning,
      restoreBusy,
      selectedAttempt?.id,
      attemptData.processes,
      branchStatus?.head_oid,
      branchStatus?.has_uncommitted_changes,
    ]
  );

  if (!filteredProcesses || filteredProcesses.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Cog className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No execution processes found for this attempt.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          data={groups}
          itemContent={itemContent}
          followOutput
          increaseViewportBy={200}
          overscan={5}
          components={{ Footer: () => <div className="pb-4" /> }}
        />
      </div>
    </div>
  );
}

export default LogsTab; // Filter entries to hide logs from collapsed processes
