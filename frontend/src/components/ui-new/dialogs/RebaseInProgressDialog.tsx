import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { attemptsApi } from '@/lib/api';

export interface RebaseInProgressDialogProps {
  workspaceId: string;
  repoId: string;
  targetBranch: string;
}

export type RebaseInProgressDialogResult =
  | { action: 'continued' }
  | { action: 'aborted' }
  | { action: 'cancelled' };

const RebaseInProgressDialogImpl =
  NiceModal.create<RebaseInProgressDialogProps>(
    ({ workspaceId, repoId, targetBranch }) => {
      const modal = useModal();
      const queryClient = useQueryClient();
      const { t } = useTranslation(['tasks', 'common']);

      const [isSubmitting, setIsSubmitting] = useState(false);
      const [error, setError] = useState<string | null>(null);

      const invalidateQueries = useCallback(async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['branchStatus', workspaceId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['attemptRepos', workspaceId],
          }),
        ]);
      }, [queryClient, workspaceId]);

      const handleContinue = useCallback(async () => {
        setIsSubmitting(true);
        setError(null);

        try {
          await attemptsApi.continueRebase(workspaceId, { repo_id: repoId });
          await invalidateQueries();

          modal.resolve({
            action: 'continued',
          } as RebaseInProgressDialogResult);
          modal.hide();
        } catch (err) {
          console.error('Failed to continue rebase:', err);
          setError(
            t(
              'rebaseInProgress.dialog.continueError',
              'Failed to continue rebase. There may be unresolved conflicts.'
            )
          );
        } finally {
          setIsSubmitting(false);
        }
      }, [workspaceId, repoId, invalidateQueries, modal, t]);

      const handleAbort = useCallback(async () => {
        setIsSubmitting(true);
        setError(null);

        try {
          await attemptsApi.abortConflicts(workspaceId, { repo_id: repoId });
          await invalidateQueries();

          modal.resolve({
            action: 'aborted',
          } as RebaseInProgressDialogResult);
          modal.hide();
        } catch (err) {
          console.error('Failed to abort rebase:', err);
          setError(
            t(
              'rebaseInProgress.dialog.abortError',
              'Failed to abort rebase. Please try again.'
            )
          );
        } finally {
          setIsSubmitting(false);
        }
      }, [workspaceId, repoId, invalidateQueries, modal, t]);

      const handleCancel = useCallback(() => {
        modal.resolve({
          action: 'cancelled',
        } as RebaseInProgressDialogResult);
        modal.hide();
      }, [modal]);

      const handleOpenChange = (open: boolean) => {
        if (!open) handleCancel();
      };

      return (
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>
                {t('rebaseInProgress.dialog.title', 'Rebase In Progress')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'rebaseInProgress.dialog.description',
                  'A rebase onto {{targetBranch}} is in progress with no conflicts. Choose how to proceed.',
                  { targetBranch }
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {error && <div className="text-sm text-destructive">{error}</div>}

              <div className="text-sm text-muted-foreground">
                {t(
                  'rebaseInProgress.dialog.hint',
                  'You can continue the rebase to complete it, or abort to return to your previous state.'
                )}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleAbort}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? t('rebaseInProgress.dialog.aborting', 'Aborting...')
                  : t('rebaseInProgress.dialog.abort', 'Abort Rebase')}
              </Button>
              <Button onClick={handleContinue} disabled={isSubmitting}>
                {isSubmitting
                  ? t('rebaseInProgress.dialog.continuing', 'Continuing...')
                  : t('rebaseInProgress.dialog.continue', 'Continue Rebase')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );

export const RebaseInProgressDialog = defineModal<
  RebaseInProgressDialogProps,
  RebaseInProgressDialogResult
>(RebaseInProgressDialogImpl);
