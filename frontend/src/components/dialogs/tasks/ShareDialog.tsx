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
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { useUserSystem } from '@/components/config-provider';
import { Link as LinkIcon, Loader2 } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { LoginRequiredPrompt } from '@/components/dialogs/shared/LoginRequiredPrompt';
import { LinkProjectDialog } from '@/components/dialogs/projects/LinkProjectDialog';
import { useAuth } from '@/hooks';
import { useProject } from '@/contexts/project-context';
import { useTaskMutations } from '@/hooks/useTaskMutations';

export interface ShareDialogProps {
  task: TaskWithAttemptStatus;
}

const ShareDialog = NiceModal.create<ShareDialogProps>(({ task }) => {
  const modal = useModal();
  const { t } = useTranslation('tasks');
  const { loading: systemLoading } = useUserSystem();
  const { isSignedIn } = useAuth();
  const { project } = useProject();
  const { shareTask } = useTaskMutations(task.project_id);

  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    shareTask.reset();
    setShareError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, shareTask.reset]);

  const handleClose = () => {
    modal.resolve(shareTask.isSuccess);
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
      await shareTask.mutateAsync(task.id);
      modal.hide();
    } catch (err) {
      if (getStatus(err) === 401) {
        void NiceModal.show('oauth');
        return;
      }
      setShareError(getReadableError(err));
    }
  };

  const handleLinkProject = () => {
    if (!project) return;

    void NiceModal.show(LinkProjectDialog, {
      projectId: project.id,
      projectName: project.name,
    });
  };

  const isShareDisabled = systemLoading || shareTask.isPending;
  const isProjectLinked = project?.remote_project_id != null;

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (open) {
          shareTask.reset();
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

        {!isSignedIn ? (
          <LoginRequiredPrompt
            buttonVariant="outline"
            buttonSize="sm"
            buttonClassName="mt-1"
          />
        ) : !isProjectLinked ? (
          <Alert className="mt-1">
            <LinkIcon className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{t('shareDialog.linkProjectRequired.description')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLinkProject}
                className="ml-2"
              >
                {t('shareDialog.linkProjectRequired.action')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {shareTask.isSuccess ? (
              <Alert variant="success">{t('shareDialog.success')}</Alert>
            ) : (
              <>
                {shareError && (
                  <Alert variant="destructive">{shareError}</Alert>
                )}
              </>
            )}
          </>
        )}

        <DialogFooter className="flex sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            {shareTask.isSuccess
              ? t('shareDialog.closeButton')
              : t('shareDialog.cancel')}
          </Button>
          {isSignedIn && isProjectLinked && !shareTask.isSuccess && (
            <Button
              onClick={handleShare}
              disabled={isShareDisabled}
              className="gap-2"
            >
              {shareTask.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('shareDialog.inProgress')}
                </>
              ) : (
                t('shareDialog.confirm')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { ShareDialog };
