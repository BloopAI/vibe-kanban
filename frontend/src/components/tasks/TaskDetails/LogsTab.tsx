import {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useReducer,
  useState,
} from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Cog, AlertTriangle, CheckCircle, GitCommit } from 'lucide-react';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import { useProcessesLogs } from '@/hooks/useProcessesLogs';
import LogEntryRow from '@/components/logs/LogEntryRow';
import {
  shouldShowInLogs,
  isAutoCollapsibleProcess,
  isProcessCompleted,
  isCodingAgent,
  getLatestCodingAgent,
  PROCESS_STATUSES,
  PROCESS_RUN_REASONS,
} from '@/constants/processes';
import type {
  ExecutionProcessStatus,
  TaskAttempt,
  BaseAgentCapability,
} from 'shared/types';
import { useUserSystem } from '@/components/config-provider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Helper functions
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
  const virtuosoRef = useRef<any>(null);

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

  const { capabilities } = useUserSystem();
  const restoreSupported = useMemo(() => {
    const exec = selectedAttempt?.executor;
    if (!exec) return false;
    const caps = capabilities?.[exec] || [];
    return caps.includes('RESTORE_CHECKPOINT' as BaseAgentCapability);
  }, [selectedAttempt?.executor, capabilities]);

  // Detect if any process is running
  const anyRunning = useMemo(
    () => (attemptData.processes || []).some((p) => p.status === 'running'),
    [attemptData.processes?.map((p) => p.status).join(',')]
  );

  const { entries } = useProcessesLogs(filteredProcesses, true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restorePid, setRestorePid] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [targetSha, setTargetSha] = useState<string | null>(null);
  const [targetSubject, setTargetSubject] = useState<string | null>(null);
  const [commitsToReset, setCommitsToReset] = useState<number | null>(null);
  const [isLinear, setIsLinear] = useState<boolean | null>(null);
  const [worktreeResetOn, setWorktreeResetOn] = useState(true);
  const [forceReset, setForceReset] = useState(false);

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

  // Filter entries to hide logs from collapsed processes
  const visibleEntries = useMemo(() => {
    return entries.filter((entry) =>
      entry.channel === 'process_start'
        ? true
        : !allCollapsedProcesses.has(entry.processId)
    );
  }, [entries, allCollapsedProcesses]);

  // Memoized item content to prevent flickering
  const itemContent = useCallback(
    (index: number, entry: any) => (
      <LogEntryRow
        entry={entry}
        index={index}
        isCollapsed={
          entry.channel === 'process_start'
            ? allCollapsedProcesses.has(entry.payload.processId)
            : undefined
        }
        onToggleCollapse={
          entry.channel === 'process_start' ? toggleProcessCollapse : undefined
        }
        // Pass restore handler via entry.meta for process_start
        // The LogEntryRow/ProcessStartCard will ignore if not provided
        {...(entry.channel === 'process_start' && restoreSupported
          ? (() => {
              const proc = (attemptData.processes || []).find(
                (p) => p.id === entry.payload.processId
              );
              // Consider only non-dropped processes that appear in logs for latest determination
              const procs = (attemptData.processes || []).filter(
                (p) => !p.dropped && shouldShowInLogs(p.run_reason)
              );
              const finished = procs.filter((p) => p.status !== 'running');
              const latestFinished =
                finished.length > 0 ? finished[finished.length - 1] : undefined;
              const isLatest = latestFinished?.id === proc?.id;
              const isRunningProc = proc?.status === 'running';
              const headKnown = !!branchStatus?.head_oid;
              const head = branchStatus?.head_oid || null;
              const isDirty = !!branchStatus?.has_uncommitted_changes;
              const needGitReset =
                headKnown &&
                !!(
                  proc?.after_head_commit &&
                  (proc.after_head_commit !== head || isDirty)
                );

              // Base visibility rules:
              // - Never show for the currently running process
              // - For earlier finished processes, show only if either:
              //     a) later history includes a coding agent run, or
              //     b) restoring would change the worktree (needGitReset)
              // - For the latest finished process, only show if diverged (needGitReset)
              let baseShouldShow = false;
              if (!isRunningProc) {
                baseShouldShow = !isLatest || needGitReset;

                // If this is an earlier finished process and restoring would not
                // change the worktree, hide when only non-coding processes would be deleted.
                if (baseShouldShow && !isLatest && !needGitReset) {
                  const procs = (attemptData.processes || []).filter(
                    (p) => !p.dropped && shouldShowInLogs(p.run_reason)
                  );
                  const idx = procs.findIndex((p) => p.id === proc?.id);
                  const later = idx >= 0 ? procs.slice(idx + 1) : [];
                  const laterHasCoding = later.some((p) =>
                    isCodingAgent(p.run_reason)
                  );
                  baseShouldShow = laterHasCoding;
                }
              }
              // If any process is running, also surface the latest finished button disabled
              // so users see it immediately with a clear disabled reason.
              const shouldShow =
                baseShouldShow || (anyRunning && !isRunningProc && isLatest);

              if (!shouldShow) return {};

              let disabledReason: string | undefined;
              let disabled = anyRunning || restoreBusy || confirmOpen;
              if (anyRunning)
                disabledReason = 'Cannot restore while a process is running.';
              else if (restoreBusy) disabledReason = 'Restore in progress.';
              else if (confirmOpen)
                disabledReason = 'Confirm the current restore first.';
              if (!proc?.after_head_commit) {
                disabled = true;
                disabledReason = 'No recorded commit for this process.';
              }
              return {
                restoreProcessId: entry.payload.processId,
                onRestore: async (pid: string) => {
                  setRestorePid(pid);
                  const p2 = (attemptData.processes || []).find(
                    (p) => p.id === pid
                  );
                  const after = p2?.after_head_commit || null;
                  setTargetSha(after);
                  setTargetSubject(null);
                  if (after && selectedAttempt?.id) {
                    try {
                      const { commitsApi } = await import('@/lib/api');
                      const info = await commitsApi.getInfo(
                        selectedAttempt.id,
                        after
                      );
                      setTargetSubject(info.subject);
                      const cmp = await commitsApi.compareToHead(
                        selectedAttempt.id,
                        after
                      );
                      setCommitsToReset(
                        cmp.is_linear ? cmp.ahead_from_head : null
                      );
                      setIsLinear(cmp.is_linear);
                    } catch {
                      /* empty */
                    }
                  }
                  // Initialize reset to disabled (white) when dirty, enabled otherwise
                  const head = branchStatus?.head_oid || null;
                  const isDirty = !!branchStatus?.has_uncommitted_changes;
                  const needGitReset = !!(after && (after !== head || isDirty));
                  const canGitReset = needGitReset && !isDirty;
                  setWorktreeResetOn(!!canGitReset);
                  setForceReset(false);
                  setConfirmOpen(true);
                },
                restoreDisabled: disabled,
                restoreDisabledReason: disabledReason,
              };
            })()
          : {})}
      />
    ),
    [
      allCollapsedProcesses,
      toggleProcessCollapse,
      restoreSupported,
      anyRunning,
      confirmOpen,
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
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        className="bg-white dark:bg-white"
      >
        <DialogContent
          className="max-h-[92vh] sm:max-h-[88vh] overflow-y-auto overflow-x-hidden"
          onKeyDownCapture={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setConfirmOpen(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 mb-3 md:mb-4">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Confirm
              Restore
            </DialogTitle>
            <DialogDescription className="mt-6 break-words">
              {(() => {
                // Only consider non-dropped processes that appear in logs for counting "later" ones
                const procs = (attemptData.processes || []).filter(
                  (p) => !p.dropped && shouldShowInLogs(p.run_reason)
                );
                const idx = procs.findIndex((p) => p.id === restorePid);
                const laterCount = idx >= 0 ? procs.length - (idx + 1) : 0;
                const hasLater = laterCount > 0;
                const head = branchStatus?.head_oid || null;
                const isDirty = !!branchStatus?.has_uncommitted_changes;
                const needGitReset = !!(
                  targetSha &&
                  (targetSha !== head || isDirty)
                );
                const canGitReset = needGitReset && !isDirty;
                const short = targetSha?.slice(0, 7);
                const uncomm = branchStatus?.uncommitted_count ?? 0;
                const untrk = branchStatus?.untracked_count ?? 0;
                const hasRisk = uncomm > 0; // Only uncommitted tracked changes are risky; untracked alone is not

                // Determine types of later processes for clearer messaging
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

                return (
                  <div className="space-y-3">
                    {hasLater && (
                      <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                        <div className="text-sm min-w-0 w-full break-words">
                          <p className="font-medium text-destructive mb-2">
                            History change
                          </p>
                          {laterCount > 0 && (
                            <>
                              <p className="mt-0.5">
                                Will delete {laterCount} later process
                                {laterCount === 1 ? '' : 'es'} from history.
                              </p>
                              <ul className="mt-1 text-xs text-muted-foreground list-disc pl-5">
                                {laterCoding > 0 && (
                                  <li>
                                    {laterCoding} coding agent run
                                    {laterCoding === 1 ? '' : 's'}
                                  </li>
                                )}
                                {laterSetup + laterCleanup > 0 && (
                                  <li>
                                    {laterSetup + laterCleanup} script process
                                    {laterSetup + laterCleanup === 1
                                      ? ''
                                      : 'es'}
                                    {laterSetup > 0 && laterCleanup > 0 && (
                                      <>
                                        {' '}
                                        ({laterSetup} setup, {laterCleanup}{' '}
                                        cleanup)
                                      </>
                                    )}
                                  </li>
                                )}
                              </ul>
                            </>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            This permanently alters history and cannot be
                            undone.
                          </p>
                        </div>
                      </div>
                    )}

                    {needGitReset && canGitReset && (
                      <div
                        className={
                          !worktreeResetOn
                            ? 'flex items-start gap-3 rounded-md border p-3'
                            : hasRisk
                              ? 'flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3'
                              : 'flex items-start gap-3 rounded-md border border-amber-300/60 bg-amber-50/70 p-3'
                        }
                      >
                        <AlertTriangle
                          className={
                            !worktreeResetOn
                              ? 'h-4 w-4 text-muted-foreground mt-0.5'
                              : hasRisk
                                ? 'h-4 w-4 text-destructive mt-0.5'
                                : 'h-4 w-4 text-amber-600 mt-0.5'
                          }
                        />
                        <div className="text-sm min-w-0 w-full break-words">
                          <p
                            className={
                              (!worktreeResetOn
                                ? 'font-medium text-muted-foreground'
                                : hasRisk
                                  ? 'font-medium text-destructive'
                                  : 'font-medium text-amber-700') + ' mb-2'
                            }
                          >
                            Reset worktree
                          </p>
                          <div
                            className="mt-2 w-full flex items-center cursor-pointer select-none"
                            role="switch"
                            aria-checked={worktreeResetOn}
                            aria-label="Toggle worktree reset"
                            onClick={() => setWorktreeResetOn((v) => !v)}
                          >
                            <div className="text-xs text-muted-foreground">
                              {worktreeResetOn ? 'Enabled' : 'Disabled'}
                            </div>
                            <div className="ml-auto relative inline-flex h-5 w-9 items-center rounded-full">
                              <span
                                className={
                                  (worktreeResetOn
                                    ? 'bg-emerald-500'
                                    : 'bg-muted-foreground/30') +
                                  ' absolute inset-0 rounded-full transition-colors'
                                }
                              />
                              <span
                                className={
                                  (worktreeResetOn
                                    ? 'translate-x-5'
                                    : 'translate-x-1') +
                                  ' pointer-events-none relative inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform'
                                }
                              />
                            </div>
                          </div>
                          {worktreeResetOn && (
                            <>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Your worktree will be restored to this commit.
                              </p>
                              <div
                                className="mt-1 flex items-center gap-2 min-w-0"
                                title={
                                  targetSubject
                                    ? `${short} — ${targetSubject}`
                                    : short || undefined
                                }
                              >
                                <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
                                {short && (
                                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">
                                    {short}
                                  </span>
                                )}
                                {targetSubject && (
                                  <span className="text-muted-foreground break-words whitespace-normal">
                                    {targetSubject}
                                  </span>
                                )}
                              </div>
                              {((isLinear &&
                                commitsToReset !== null &&
                                commitsToReset > 0) ||
                                uncomm > 0 ||
                                untrk > 0) && (
                                <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-5">
                                  {isLinear &&
                                    commitsToReset !== null &&
                                    commitsToReset > 0 && (
                                      <li>
                                        Roll back {commitsToReset} commit
                                        {commitsToReset === 1 ? '' : 's'} from
                                        current HEAD.
                                      </li>
                                    )}
                                  {uncomm > 0 && (
                                    <li>
                                      Discard {uncomm} uncommitted change
                                      {uncomm === 1 ? '' : 's'}.
                                    </li>
                                  )}
                                  {untrk > 0 && (
                                    <li>
                                      {untrk} untracked file
                                      {untrk === 1 ? '' : 's'} present (not
                                      affected by reset).
                                    </li>
                                  )}
                                </ul>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {needGitReset &&
                      !canGitReset &&
                      (() => {
                        const showDanger = forceReset && worktreeResetOn;
                        return (
                          <div
                            className={
                              showDanger
                                ? 'flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3'
                                : 'flex items-start gap-3 rounded-md border p-3'
                            }
                          >
                            <AlertTriangle
                              className={
                                showDanger
                                  ? 'h-4 w-4 text-destructive mt-0.5'
                                  : 'h-4 w-4 text-muted-foreground mt-0.5'
                              }
                            />
                            <div className="text-sm min-w-0 w-full break-words">
                              <p
                                className={
                                  showDanger
                                    ? 'font-medium text-destructive'
                                    : 'font-medium text-muted-foreground'
                                }
                              >
                                Reset worktree
                              </p>
                              <div
                                className={`mt-2 w-full flex items-center select-none ${forceReset ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                                role="switch"
                                aria-checked={worktreeResetOn}
                                aria-label="Toggle worktree reset"
                                onClick={() => {
                                  if (!forceReset) return;
                                  setWorktreeResetOn((v) => !v);
                                }}
                              >
                                <div className="text-xs text-muted-foreground">
                                  {forceReset
                                    ? worktreeResetOn
                                      ? 'Enabled'
                                      : 'Disabled'
                                    : 'Disabled (uncommitted changes detected)'}
                                </div>
                                <div className="ml-auto relative inline-flex h-5 w-9 items-center rounded-full">
                                  <span
                                    className={
                                      (worktreeResetOn && forceReset
                                        ? 'bg-emerald-500'
                                        : 'bg-muted-foreground/30') +
                                      ' absolute inset-0 rounded-full transition-colors'
                                    }
                                  />
                                  <span
                                    className={
                                      (worktreeResetOn && forceReset
                                        ? 'translate-x-5'
                                        : 'translate-x-1') +
                                      ' pointer-events-none relative inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform'
                                    }
                                  />
                                </div>
                              </div>
                              <div
                                className="mt-2 w-full flex items-center cursor-pointer select-none"
                                role="switch"
                                aria-checked={forceReset}
                                aria-label="Force reset (discard uncommitted changes)"
                                onClick={() => {
                                  setForceReset((v) => {
                                    const next = !v;
                                    if (next) setWorktreeResetOn(true);
                                    return next;
                                  });
                                }}
                              >
                                <div className="text-xs font-medium text-destructive">
                                  Force reset (discard uncommitted changes)
                                </div>
                                <div className="ml-auto relative inline-flex h-5 w-9 items-center rounded-full">
                                  <span
                                    className={
                                      (forceReset
                                        ? 'bg-destructive'
                                        : 'bg-muted-foreground/30') +
                                      ' absolute inset-0 rounded-full transition-colors'
                                    }
                                  />
                                  <span
                                    className={
                                      (forceReset
                                        ? 'translate-x-5'
                                        : 'translate-x-1') +
                                      ' pointer-events-none relative inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform'
                                    }
                                  />
                                </div>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {forceReset
                                  ? 'Uncommitted changes will be discarded.'
                                  : 'Uncommitted changes present. Turn on Force reset or commit/stash to proceed.'}
                              </p>
                              {((branchStatus?.uncommitted_count ?? 0) > 0 ||
                                (branchStatus?.untracked_count ?? 0) > 0) && (
                                <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-5">
                                  {(branchStatus?.uncommitted_count ?? 0) >
                                    0 && (
                                    <li>
                                      {
                                        branchStatus?.uncommitted_count as number
                                      }{' '}
                                      uncommitted change
                                      {(branchStatus?.uncommitted_count as number) ===
                                      1
                                        ? ''
                                        : 's'}{' '}
                                      present.
                                    </li>
                                  )}
                                  {(branchStatus?.untracked_count ?? 0) > 0 && (
                                    <li>
                                      {branchStatus?.untracked_count as number}{' '}
                                      untracked file
                                      {(branchStatus?.untracked_count as number) ===
                                      1
                                        ? ''
                                        : 's'}{' '}
                                      present.
                                    </li>
                                  )}
                                </ul>
                              )}
                              {short && (
                                <>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Your worktree will be restored to this
                                    commit.
                                  </p>
                                  <div
                                    className="mt-1 flex items-center gap-2 min-w-0"
                                    title={
                                      targetSubject
                                        ? `${short} — ${targetSubject}`
                                        : short || undefined
                                    }
                                  >
                                    <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">
                                      {short}
                                    </span>
                                    {targetSubject && (
                                      <span className="text-muted-foreground break-words whitespace-normal">
                                        {targetSubject}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                    {!hasLater && !needGitReset && (
                      <div className="flex items-start gap-3 rounded-md border border-green-300/60 bg-green-50/70 p-3">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                        <div className="text-sm min-w-0 w-full break-words">
                          <p className="font-medium text-green-700 mb-2">
                            Nothing to change
                          </p>
                          <p className="mt-0.5">
                            You are already at this checkpoint.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={(() => {
                // Disable when there's nothing to change
                const procs = (attemptData.processes || []).filter(
                  (p) => !p.dropped && shouldShowInLogs(p.run_reason)
                );
                const idx = procs.findIndex((p) => p.id === restorePid);
                const laterCount = idx >= 0 ? procs.length - (idx + 1) : 0;
                const hasLater = laterCount > 0;
                const head = branchStatus?.head_oid || null;
                const isDirty = !!branchStatus?.has_uncommitted_changes;
                const needGitReset = !!(
                  targetSha &&
                  (targetSha !== head || isDirty)
                );
                const effectiveNeedGitReset =
                  needGitReset &&
                  worktreeResetOn &&
                  (!isDirty || (isDirty && forceReset));
                return restoreBusy || (!hasLater && !effectiveNeedGitReset);
              })()}
              onClick={async () => {
                if (!selectedAttempt?.id || !restorePid) return;
                const { attemptsApi } = await import('@/lib/api');
                try {
                  setRestoreBusy(true);
                  // Short-circuit when nothing to change
                  const procs = (attemptData.processes || []).filter(
                    (p) => !p.dropped && shouldShowInLogs(p.run_reason)
                  );
                  const idx = procs.findIndex((p) => p.id === restorePid);
                  const laterCount = idx >= 0 ? procs.length - (idx + 1) : 0;
                  const hasLater = laterCount > 0;
                  const head = branchStatus?.head_oid || null;
                  const isDirty = !!branchStatus?.has_uncommitted_changes;
                  const needGitReset = !!(
                    targetSha &&
                    (targetSha !== head || isDirty)
                  );
                  const effectiveNeedGitReset =
                    needGitReset &&
                    worktreeResetOn &&
                    (!isDirty || (isDirty && forceReset));
                  if (!hasLater && !effectiveNeedGitReset) {
                    // No-op: simply close and refresh state lightly
                    setRestoreBusy(false);
                    setConfirmOpen(false);
                    setRestorePid(null);
                    return;
                  }
                  await attemptsApi.restore(selectedAttempt.id!, restorePid, {
                    performGitReset: worktreeResetOn,
                    forceWhenDirty: forceReset,
                  });
                  // Immediately refresh processes so UI reflects dropped state without delay
                  await refetch();
                  await refetchBranch();
                } finally {
                  setRestoreBusy(false);
                }
                setConfirmOpen(false);
                setRestorePid(null);
              }}
            >
              {(() => {
                if (restoreBusy) return 'Restoring…';
                const procs = (attemptData.processes || []).filter(
                  (p) => !p.dropped && shouldShowInLogs(p.run_reason)
                );
                const idx = procs.findIndex((p) => p.id === restorePid);
                const laterCount = idx >= 0 ? procs.length - (idx + 1) : 0;
                const hasLater = laterCount > 0;
                const head = branchStatus?.head_oid || null;
                const isDirty = !!branchStatus?.has_uncommitted_changes;
                const needGitReset = !!(
                  targetSha &&
                  (targetSha !== head || isDirty)
                );
                const effectiveNeedGitReset =
                  needGitReset &&
                  worktreeResetOn &&
                  (!isDirty || (isDirty && forceReset));
                return !hasLater && !effectiveNeedGitReset
                  ? 'Nothing to change'
                  : 'Restore';
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex-1">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          data={visibleEntries}
          itemContent={itemContent}
          followOutput={true}
          increaseViewportBy={200}
          overscan={5}
          components={{
            Footer: () => <div className="pb-4" />,
          }}
        />
      </div>
    </div>
  );
}

export default LogsTab;
