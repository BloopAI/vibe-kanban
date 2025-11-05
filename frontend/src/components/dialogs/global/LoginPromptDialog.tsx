import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LogIn, GitPullRequest, Users, Eye } from 'lucide-react';
import { useClerk } from '@clerk/clerk-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';

const LoginPromptDialog = NiceModal.create(() => {
  const modal = useModal();
  const { redirectToSignUp } = useClerk();
  const { t } = useTranslation('tasks');

  const handleSignIn = () => {
    modal.resolve('login');
    const redirectUrl =
      typeof window !== 'undefined' ? window.location.href : undefined;
    void redirectToSignUp({ redirectUrl });
  };

  const handleSkip = () => {
    modal.resolve('skip');
    modal.hide();
  };

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) {
          modal.resolve('skip');
          modal.hide();
        }
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <LogIn className="h-6 w-6 text-primary-foreground" />
            <DialogTitle>{t('loginPrompt.title')}</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            {t('loginPrompt.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex items-start gap-3">
            <GitPullRequest className="h-5 w-5 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {t('loginPrompt.features.pullRequests.title')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('loginPrompt.features.pullRequests.description')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {t('loginPrompt.features.shareTasks.title')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('loginPrompt.features.shareTasks.description')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Eye className="h-5 w-5 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {t('loginPrompt.features.trackProgress.title')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('loginPrompt.features.trackProgress.description')}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleSkip}>
            {t('loginPrompt.buttons.skip')}
          </Button>
          <Button onClick={handleSignIn}>
            <LogIn className="h-4 w-4 mr-2" />
            {t('loginPrompt.buttons.signIn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { LoginPromptDialog };
