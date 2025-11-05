import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';
import { useClerk } from '@clerk/clerk-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { LoginRequiredPrompt } from '@/components/dialogs/shared/LoginRequiredPrompt';

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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <LogIn className="h-6 w-6 text-primary text-primary-foreground" />
            <DialogTitle>Sign in to unlock more</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Connect your account to access collaboration features
          </DialogDescription>
        </DialogHeader>

        <LoginRequiredPrompt
          mode="signUp"
          onAction={handleSignIn}
          title="Why sign in?"
          description="Sign in to create GitHub pull requests, share tasks with your team, and get visibility on what your team is working on."
          actionLabel="Sign in"
        />

        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { LoginPromptDialog };
