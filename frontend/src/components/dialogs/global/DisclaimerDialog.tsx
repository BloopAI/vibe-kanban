import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

const DisclaimerDialog = NiceModal.create(() => {
  const modal = useModal();

  const handleAccept = () => {
    modal.resolve('accepted');
  };

  return (
    <Dialog open={modal.visible} uncloseable={true}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <DialogTitle>Safety Notice</DialogTitle>
          </div>
          <DialogDescription className="text-left space-y-4 pt-4">
            <p>
              Vibe Kanban runs AI coding agents with{' '}
              <code>--dangerously-skip-permissions</code> / <code>--yolo</code>{' '}
              by default, giving them unrestricted access to execute code and
              run commands on your system.
            </p>
            <p>
              <strong>Important:</strong> Always review what agents are doing
              and ensure you have backups of important work. This software is
              experimental - use it responsibly.
            </p>
            <p>
              Learn more at{' '}
              <a
                href="https://www.vibekanban.com/docs/getting-started#safety-notice"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline hover:no-underline"
              >
                https://www.vibekanban.com/docs/getting-started#safety-notice
              </a>
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleAccept} variant="default">
            I Understand, Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { DisclaimerDialog };
