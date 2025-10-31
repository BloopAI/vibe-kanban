import { useEffect, useState } from 'react';
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
import { Loader } from '@/components/ui/loader';
import { tasksApi } from '@/lib/api';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { useUserSystem } from '@/components/config-provider';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { Loader2, LogIn } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { useMutation } from '@tanstack/react-query';

export interface ShareDialogProps {
  task: TaskWithAttemptStatus;
}

const ShareDialog = NiceModal.create<ShareDialogProps>(({ task }) => {
  const modal = useModal();
  const { t } = useTranslation('tasks');
  const {
    config,
    githubTokenInvalid,
    reloadSystem,
    loading: systemLoading,
  } = useUserSystem();

  const [shareError, setShareError] = useState<string | null>(null);
  const [shouldRedirectToSignIn, setShouldRedirectToSignIn] = useState(false);

  const isGitHubConnected =
    Boolean(config?.github?.username && config?.github?.oauth_token) &&
    !githubTokenInvalid;

  const shareMutation = useMutation({
    mutationKey: ['tasks', 'share', task.id],
    mutationFn: () => tasksApi.share(task.id),
  });

  useEffect(() => {
    shareMutation.reset();
    setShareError(null);
    setShouldRedirectToSignIn(false);
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
        : t('shareDialog.githubRequired.description');
    }
    return err instanceof Error ? err.message : t('shareDialog.genericError');
  };

  const handleShare = async () => {
    setShareError(null);
    try {
      await shareMutation.mutateAsync();
    } catch (err) {
      if (getStatus(err) === 401 && !isGitHubConnected) {
        try {
          const success = await NiceModal.show('github-login');
          if (success) {
            shareMutation.reset();
            await reloadSystem();
            await shareMutation.mutateAsync();
            return;
          }
        } catch {
          /* user canceled */
        }
      }
      setShareError(getReadableError(err));
    }
  };

  const handleGitHubConnect = async () => {
    try {
      const success = await NiceModal.show('github-login');
      if (success) {
        await reloadSystem();
      }
    } catch {
      // Swallow cancellation errors
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
          setShouldRedirectToSignIn(false);
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
          {shouldRedirectToSignIn ? (
            <RedirectToSignIn
              redirectUrl={
                typeof window !== 'undefined' ? window.location.href : undefined
              }
            />
          ) : (
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
                  onClick={() => setShouldRedirectToSignIn(true)}
                  className="mt-1"
                >
                  {t('shareDialog.loginRequired.action')}
                </Button>
              </div>
            </Alert>
          )}
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

              {systemLoading ? (
                <div className="py-6 flex justify-center">
                  <Loader message={t('shareDialog.loadingSystem')} />
                </div>
              ) : (
                <div className="space-y-4">
                  {!isGitHubConnected && (
                    <Alert variant="default" className="flex items-start gap-3">
                      <div className="space-y-2">
                        <div className="font-medium">
                          {t('shareDialog.githubRequired.title')}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {t('shareDialog.githubRequired.description')}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGitHubConnect}
                          className="mt-1"
                        >
                          {t('shareDialog.githubRequired.action')}
                        </Button>
                      </div>
                    </Alert>
                  )}
                </div>
              )}
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
