import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, GitCommit } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface RestoreLogsDialogProps {
  targetSha: string | null;
  targetSubject: string | null;
  commitsToReset: number | null;
  isLinear: boolean | null;
  laterCount: number;
  laterCoding: number;
  laterSetup: number;
  laterCleanup: number;
  needGitReset: boolean;
  canGitReset: boolean;
  hasRisk: boolean;
  uncommittedCount: number;
  untrackedCount: number;
  initialWorktreeResetOn: boolean;
  initialForceReset: boolean;
}

export type RestoreLogsDialogResult = {
  action: 'confirmed' | 'canceled';
  performGitReset?: boolean;
  forceWhenDirty?: boolean;
};

export const RestoreLogsDialog = NiceModal.create<RestoreLogsDialogProps>(
  ({
    targetSha,
    targetSubject,
    commitsToReset,
    isLinear,
    laterCount,
    laterCoding,
    laterSetup,
    laterCleanup,
    needGitReset,
    canGitReset,
    hasRisk,
    uncommittedCount,
    untrackedCount,
    initialWorktreeResetOn,
    initialForceReset,
  }) => {
    const modal = useModal();
    const [worktreeResetOn, setWorktreeResetOn] = useState(
      initialWorktreeResetOn
    );
    const [forceReset, setForceReset] = useState(initialForceReset);

    const hasLater = laterCount > 0;
    const short = targetSha?.slice(0, 7);
    // Note: confirm enabling logic handled in footer based on uncommitted changes

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
              <AlertTriangle className="h-4 w-4 text-destructive" /> Confirm
              Retry
            </DialogTitle>
            <DialogDescription className="mt-6 break-words">
              <div className="space-y-3">
                {hasLater && (
                  <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                    <div className="text-sm min-w-0 w-full break-words">
                      <p className="font-medium text-destructive mb-2">
                        History change
                      </p>
                      <>
                        <p className="mt-0.5">
                          Will delete this process
                          {laterCount > 0 && (
                            <>
                              {' '}
                              and {laterCount} later process
                              {laterCount === 1 ? '' : 'es'}
                            </>
                          )}{' '}
                          from history.
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
                              {laterSetup + laterCleanup === 1 ? '' : 'es'}
                              {laterSetup > 0 && laterCleanup > 0 && (
                                <>
                                  {' '}
                                  ({laterSetup} setup, {laterCleanup} cleanup)
                                </>
                              )}
                            </li>
                          )}
                        </ul>
                      </>
                      <p className="mt-1 text-xs text-muted-foreground">
                        This permanently alters history and cannot be undone.
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
                      <p className="font-medium mb-2">Reset worktree</p>
                      <div
                        className="mt-2 w-full flex items-center cursor-pointer select-none"
                        role="switch"
                        aria-checked={worktreeResetOn}
                        onClick={() => setWorktreeResetOn((v) => !v)}
                      >
                        <div className="text-xs text-muted-foreground flex-1 min-w-0 break-words">
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
                                    Roll back {commitsToReset} commit
                                    {commitsToReset === 1 ? '' : 's'} from
                                    current HEAD.
                                  </li>
                                )}
                              {uncommittedCount > 0 && (
                                <li>
                                  Discard {uncommittedCount} uncommitted change
                                  {uncommittedCount === 1 ? '' : 's'}.
                                </li>
                              )}
                              {untrackedCount > 0 && (
                                <li>
                                  {untrackedCount} untracked file
                                  {untrackedCount === 1 ? '' : 's'} present (not
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
                        Reset worktree
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
                        onClick={() => {
                          setForceReset((v) => {
                            const next = !v;
                            if (next) setWorktreeResetOn(true);
                            return next;
                          });
                        }}
                      >
                        <div className="text-xs font-medium text-destructive flex-1 min-w-0 break-words">
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
                              (forceReset ? 'translate-x-5' : 'translate-x-1') +
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
                      {short && (
                        <>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Your worktree will be restored to this commit.
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
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                // Disable when uncommitted changes present and user hasn't enabled force
                // or explicitly disabled worktree reset.
                (hasRisk && worktreeResetOn && needGitReset && !forceReset) ||
                false
              }
              onClick={handleConfirm}
            >
              Retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
