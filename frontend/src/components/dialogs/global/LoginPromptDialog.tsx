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

const LoginPromptDialog = NiceModal.create(() => {
  const modal = useModal();
  const { redirectToSignUp } = useClerk();

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
            <DialogTitle>Sign in to Vibe Kanban</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Unlock team collaboration features
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex items-start gap-3">
            <GitPullRequest className="h-5 w-5 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Create pull requests</p>
              <p className="text-xs text-muted-foreground">
                Push changes directly to GitHub
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Share tasks with your team</p>
              <p className="text-xs text-muted-foreground">
                Collaborate on work together
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Eye className="h-5 w-5 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">See what others are doing</p>
              <p className="text-xs text-muted-foreground">
                Track team progress in real-time
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
          <Button onClick={handleSignIn}>
            <LogIn className="h-4 w-4 mr-2" />
            Sign in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { LoginPromptDialog };
