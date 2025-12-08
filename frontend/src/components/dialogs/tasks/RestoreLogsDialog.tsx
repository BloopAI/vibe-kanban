import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, GitCommit, Loader2 } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useKeySubmitTask } from '@/keyboard/hooks';
import { Scope } from '@/keyboard/registry';
import { executionProcessesApi, commitsApi } from '@/lib/api';
import {
  shouldShowInLogs,
  isCodingAgent,
  PROCESS_RUN_REASONS,
} from '@/constants/processes';
import type { BranchStatus, ExecutionProcess } from 'shared/types';

export interface RestoreLogsDialogProps {
  attemptId: string;
  executionProcessId: string;
  branchStatus: BranchStatus | undefined;
  processes: ExecutionProcess[] | undefined;
  initialWorktreeResetOn?: boolean;
  initialForceReset?: boolean;
}

export type RestoreLogsDialogResult = {
  action: 'confirmed' | 'canceled';
  performGitReset?: boolean;
  forceWhenDirty?: boolean;
};

const RestoreLogsDialogImpl = NiceModal.create<RestoreLogsDialogProps>(
  ({
    attemptId,
    executionProcessId,
    branchStatus,
    processes,
    initialWorktreeResetOn = false,
    initialForceReset = false,
  }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks', 'common']);
    const [isLoading, setIsLoading] = useState(true);
    const [worktreeResetOn, setWorktreeResetOn] = useState(
      initialWorktreeResetOn
    );
    const [forceReset, setForceReset] = useState(initialForceReset);
    const [acknowledgeUncommitted, setAcknowledgeUncommitted] = useState(false);

    // Fetched data
    const [targetSha, setTargetSha] = useState<string | null>(null);
    const [targetSubject, setTargetSubject] = useState<string | null>(null);
    const [commitsToReset, setCommitsToReset] = useState<number | null>(null);
    const [isLinear, setIsLinear] = useState<boolean | null>(null);

    // Fetch execution process and commit info
    useEffect(() => {
      let cancelled = false;
      setIsLoading(true);

      (async () => {
        try {
          const proc =
            await executionProcessesApi.getDetails(executionProcessId);
          const sha = proc.before_head_commit || null;
          if (cancelled) return;
          setTargetSha(sha);

          if (sha) {
            try {
              const cmp = await commitsApi.compareToHead(attemptId, sha);
              if (!cancelled) {
                setTargetSubject(cmp.subject);
                setCommitsToReset(cmp.is_linear ? cmp.ahead_from_head : null);
                setIsLinear(cmp.is_linear);
              }
            } catch {
              /* ignore commit info errors */
            }
          }
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [attemptId, executionProcessId]);

    // Compute later processes from props
    const { laterCount, laterCoding, laterSetup, laterCleanup } =
      useMemo(() => {
        const procs = (processes || []).filter(
          (p) => !p.dropped && shouldShowInLogs(p.run_reason)
        );
        const idx = procs.findIndex((p) => p.id === executionProcessId);
        const later = idx >= 0 ? procs.slice(idx + 1) : [];
        return {
          laterCount: later.length,
          laterCoding: later.filter((p) => isCodingAgent(p.run_reason)).length,
          laterSetup: later.filter(
            (p) => p.run_reason === PROCESS_RUN_REASONS.SETUP_SCRIPT
          ).length,
          laterCleanup: later.filter(
            (p) => p.run_reason === PROCESS_RUN_REASONS.CLEANUP_SCRIPT
          ).length,
        };
      }, [processes, executionProcessId]);

    // Compute git reset state from branchStatus
    const head = branchStatus?.head_oid || null;
    const dirty = !!branchStatus?.has_uncommitted_changes;
    const needGitReset = !!(targetSha && (targetSha !== head || dirty));
    const canGitReset = needGitReset && !dirty;
    const hasRisk = dirty;
    const uncommittedCount = branchStatus?.uncommitted_count ?? 0;
    const untrackedCount = branchStatus?.untracked_count ?? 0;

    const hasLater = laterCount > 0;
    const short = targetSha?.slice(0, 7);

    const isConfirmDisabled =
      isLoading ||
      (dirty && !acknowledgeUncommitted) ||
      (hasRisk && worktreeResetOn && needGitReset && !forceReset);

    const handleConfirm = () => {
      modal.resolve({
        action: 'confirmed',
        performGitReset: worktreeResetOn,
        forceWhenDirty: forceReset,
      } as RestoreLogsDialogResult);
      modal.hide();
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as RestoreLogsDialogResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    // CMD+Enter to confirm
    useKeySubmitTask(handleConfirm, {
      scope: Scope.DIALOG,
      when: modal.visible && !isConfirmDisabled,
    });

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-h-[92vh] sm:max-h-[88vh] overflow-y-auto overflow-x-hidden"
          onKeyDownCapture={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              handleCancel();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 mb-3 md:mb-4">
              <AlertTriangle className="h-4 w-4 text-destructive" />{' '}
              {t('restoreLogsDialog.title')}
            </DialogTitle>
            <div className="mt-6 break-words text-sm text-muted-foreground">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  {hasLater && (
                    <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                      <div className="text-sm min-w-0 w-full break-words">
                        <p className="font-medium text-destructive mb-2">
                          {t('restoreLogsDialog.historyChange.title')}
                        </p>
                        <>
                          <p className="mt-0.5">
                            {t('restoreLogsDialog.historyChange.willDelete')}
                            {laterCount > 0 && (
                              <>
                                {' '}
                                {t(
                                  'restoreLogsDialog.historyChange.andLaterProcesses',
                                  { count: laterCount }
                                )}
                              </>
                            )}{' '}
                            {t('restoreLogsDialog.historyChange.fromHistory')}
                          </p>
                          <ul className="mt-1 text-xs text-muted-foreground list-disc pl-5">
                            {laterCoding > 0 && (
                              <li>
                                {t(
                                  'restoreLogsDialog.historyChange.codingAgentRuns',
                                  { count: laterCoding }
                                )}
                              </li>
                            )}
                            {laterSetup + laterCleanup > 0 && (
                              <li>
                                {t(
                                  'restoreLogsDialog.historyChange.scriptProcesses',
                                  { count: laterSetup + laterCleanup }
                                )}
                                {laterSetup > 0 && laterCleanup > 0 && (
                                  <>
                                    {' '}
                                    {t(
                                      'restoreLogsDialog.historyChange.setupCleanupBreakdown',
                                      {
                                        setup: laterSetup,
                                        cleanup: laterCleanup,
                                      }
                                    )}
                                  </>
                                )}
                              </li>
                            )}
                          </ul>
                        </>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(
                            'restoreLogsDialog.historyChange.permanentWarning'
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {dirty && (
                    <div className="flex items-start gap-3 rounded-md border border-amber-300/60 bg-amber-50/70 dark:border-amber-400/30 dark:bg-amber-900/20 p-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div className="text-sm min-w-0 w-full break-words">
                        <p className="font-medium text-amber-700 dark:text-amber-300">
                          {t('restoreLogsDialog.uncommittedChanges.title')}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(
                            'restoreLogsDialog.uncommittedChanges.description',
                            {
                              count: uncommittedCount,
                            }
                          )}
                          {untrackedCount > 0 &&
                            t(
                              'restoreLogsDialog.uncommittedChanges.andUntracked',
                              {
                                count: untrackedCount,
                              }
                            )}
                          .
                        </p>
                        <div
                          className="mt-2 w-full flex items-center cursor-pointer select-none"
                          role="switch"
                          aria-checked={acknowledgeUncommitted}
                          onClick={() => setAcknowledgeUncommitted((v) => !v)}
                        >
                          <div className="text-xs text-muted-foreground flex-1 min-w-0 break-words">
                            {t(
                              'restoreLogsDialog.uncommittedChanges.acknowledgeLabel'
                            )}
                          </div>
                          <div className="ml-auto relative inline-flex h-5 w-9 items-center rounded-full">
                            <span
                              className={
                                (acknowledgeUncommitted
                                  ? 'bg-amber-500'
                                  : 'bg-muted-foreground/30') +
                                ' absolute inset-0 rounded-full transition-colors'
                              }
                            />
                            <span
                              className={
                                (acknowledgeUncommitted
                                  ? 'translate-x-5'
                                  : 'translate-x-1') +
                                ' pointer-events-none relative inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform'
                              }
                            />
                          </div>
                        </div>
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
                            : 'flex items-start gap-3 rounded-md border p-3 border-amber-300/60 bg-amber-50/70 dark:border-amber-400/30 dark:bg-amber-900/20'
                      }
                    >
                      <AlertTriangle
                        className={
                          !worktreeResetOn
                            ? 'h-4 w-4 text-muted-foreground mt-0.5'
                            : hasRisk
                              ? 'h-4 w-4 text-destructive mt-0.5'
                              : 'h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5'
                        }
                      />
                      <div className="text-sm min-w-0 w-full break-words">
                        <p className="font-medium mb-2">
                          {t('restoreLogsDialog.resetWorktree.title')}
                        </p>
                        <div
                          className="mt-2 w-full flex items-center cursor-pointer select-none"
                          role="switch"
                          aria-checked={worktreeResetOn}
                          onClick={() => setWorktreeResetOn((v) => !v)}
                        >
                          <div className="text-xs text-muted-foreground flex-1 min-w-0 break-words">
                            {worktreeResetOn
                              ? t('restoreLogsDialog.resetWorktree.enabled')
                              : t('restoreLogsDialog.resetWorktree.disabled')}
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
                              {t(
                                'restoreLogsDialog.resetWorktree.restoreDescription'
                              )}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 min-w-0">
                              <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
                              {short && (
                                <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">
                                  {short}
                                </span>
                              )}
                              {targetSubject && (
                                <span className="text-muted-foreground break-words flex-1 min-w-0 max-w-full">
                                  {targetSubject}
                                </span>
                              )}
                            </div>
                            {((isLinear &&
                              commitsToReset !== null &&
                              commitsToReset > 0) ||
                              uncommittedCount > 0 ||
                              untrackedCount > 0) && (
                              <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-5">
                                {isLinear &&
                                  commitsToReset !== null &&
                                  commitsToReset > 0 && (
                                    <li>
                                      {t(
                                        'restoreLogsDialog.resetWorktree.rollbackCommits',
                                        { count: commitsToReset }
                                      )}
                                    </li>
                                  )}
                                {uncommittedCount > 0 && (
                                  <li>
                                    {t(
                                      'restoreLogsDialog.resetWorktree.discardChanges',
                                      { count: uncommittedCount }
                                    )}
                                  </li>
                                )}
                                {untrackedCount > 0 && (
                                  <li>
                                    {t(
                                      'restoreLogsDialog.resetWorktree.untrackedPresent',
                                      { count: untrackedCount }
                                    )}
                                  </li>
                                )}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {needGitReset && !canGitReset && (
                    <div
                      className={
                        forceReset && worktreeResetOn
                          ? 'flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3'
                          : 'flex items-start gap-3 rounded-md border p-3'
                      }
                    >
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                      <div className="text-sm min-w-0 w-full break-words">
                        <p className="font-medium text-destructive">
                          {t('restoreLogsDialog.resetWorktree.title')}
                        </p>
                        <div
                          className={`mt-2 w-full flex items-center select-none cursor-pointer`}
                          role="switch"
                          onClick={() => {
                            setWorktreeResetOn((on) => {
                              if (forceReset) return !on; // free toggle when forced
                              // Without force, only allow explicitly disabling reset
                              return false;
                            });
                          }}
                        >
                          <div className="text-xs text-muted-foreground flex-1 min-w-0 break-words">
                            {forceReset
                              ? worktreeResetOn
                                ? t('restoreLogsDialog.resetWorktree.enabled')
                                : t('restoreLogsDialog.resetWorktree.disabled')
                              : t(
                                  'restoreLogsDialog.resetWorktree.disabledUncommitted'
                                )}
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
                          onClick={() => {
                            setForceReset((v) => {
                              const next = !v;
                              if (next) setWorktreeResetOn(true);
                              return next;
                            });
                          }}
                        >
                          <div className="text-xs font-medium text-destructive flex-1 min-w-0 break-words">
                            {t('restoreLogsDialog.resetWorktree.forceReset')}
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
                            ? t(
                                'restoreLogsDialog.resetWorktree.uncommittedWillDiscard'
                              )
                            : t(
                                'restoreLogsDialog.resetWorktree.uncommittedPresentHint'
                              )}
                        </p>
                        {short && (
                          <>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {t(
                                'restoreLogsDialog.resetWorktree.restoreDescription'
                              )}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 min-w-0">
                              <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">
                                {short}
                              </span>
                              {targetSubject && (
                                <span className="text-muted-foreground break-words flex-1 min-w-0 max-w-full">
                                  {targetSubject}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={isConfirmDisabled}
              onClick={handleConfirm}
            >
              {t('restoreLogsDialog.buttons.retry')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const RestoreLogsDialog = defineModal<
  RestoreLogsDialogProps,
  RestoreLogsDialogResult
>(RestoreLogsDialogImpl);
