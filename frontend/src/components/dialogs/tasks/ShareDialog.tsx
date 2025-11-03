import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { tasksApi } from '@/lib/api';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { useUserSystem } from '@/components/config-provider';
import {
  SignedIn,
  SignedOut,
  useClerk,
} from '@clerk/clerk-react';
import { Loader2, LogIn } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { useMutation } from '@tanstack/react-query';

export interface ShareDialogProps {
  task: TaskWithAttemptStatus;
}

const ShareDialog = NiceModal.create<ShareDialogProps>(({ task }) => {
  const modal = useModal();
  const { t } = useTranslation('tasks');
  const { loading: systemLoading } = useUserSystem();

  const [shareError, setShareError] = useState<string | null>(null);

  const shareMutation = useMutation({
    mutationKey: ['tasks', 'share', task.id],
    mutationFn: () => tasksApi.share(task.id),
  });

  const { redirectToSignUp } = useClerk();

  const redirectToClerkSignUp = useCallback(() => {
    const redirectUrl =
      typeof window !== 'undefined' ? window.location.href : undefined;
    void redirectToSignUp({ redirectUrl });
  }, [redirectToSignUp]);

  useEffect(() => {
    shareMutation.reset();
    setShareError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, shareMutation.reset]);

  const handleClose = () => {
    modal.resolve(shareMutation.isSuccess);
    modal.hide();
  };

  const getStatus = (err: unknown) =>
    err && typeof err === 'object' && 'status' in err
      ? (err as { status?: number }).status
      : undefined;

  const getReadableError = (err: unknown) => {
    const status = getStatus(err);
    if (status === 401) {
      return err instanceof Error && err.message
        ? err.message
        : t('shareDialog.loginRequired.description');
    }
    return err instanceof Error ? err.message : t('shareDialog.genericError');
  };

  const handleShare = async () => {
    setShareError(null);
    try {
      await shareMutation.mutateAsync();
    } catch (err) {
      if (getStatus(err) === 401) {
        redirectToClerkSignUp();
        return;
      }
      setShareError(getReadableError(err));
    }
  };

  const isShareDisabled = systemLoading || shareMutation.isPending;

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (open) {
          shareMutation.reset();
          setShareError(null);
        } else {
          handleClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shareDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('shareDialog.description', { title: task.title })}
          </DialogDescription>
        </DialogHeader>

        <SignedOut>
          <Alert variant="default" className="flex items-start gap-3">
            <LogIn className="h-5 w-5 mt-0.5 text-muted-foreground" />
            <div className="space-y-2">
              <div className="font-medium">
                {t('shareDialog.loginRequired.title')}
              </div>
              <p className="text-sm text-muted-foreground">
                {t('shareDialog.loginRequired.description')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={redirectToClerkSignUp}
                className="mt-1"
              >
                {t('shareDialog.loginRequired.action')}
              </Button>
            </div>
          </Alert>
        </SignedOut>

        <SignedIn>
          {shareMutation.isSuccess ? (
            <Alert
              variant="default"
              className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
            >
              {t('shareDialog.success')}
            </Alert>
          ) : (
            <>
              {shareError && <Alert variant="destructive">{shareError}</Alert>}
            </>
          )}
        </SignedIn>

        <DialogFooter className="flex sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            {shareMutation.isSuccess
              ? t('shareDialog.closeButton')
              : t('shareDialog.cancel')}
          </Button>
          <SignedIn>
            {!shareMutation.isSuccess && (
              <Button
                onClick={handleShare}
                disabled={isShareDisabled}
                className="gap-2"
              >
                {shareMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('shareDialog.inProgress')}
                  </>
                ) : (
                  t('shareDialog.confirm')
                )}
              </Button>
            )}
          </SignedIn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { ShareDialog };
