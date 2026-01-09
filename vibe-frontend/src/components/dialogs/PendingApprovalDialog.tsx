import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Clock, XCircle, Mail, RefreshCw } from 'lucide-react';
import { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import type { UserRegistration } from 'shared/types';

export interface PendingApprovalDialogProps {
  registration: UserRegistration;
  onRefresh?: () => void;
}

export type PendingApprovalDialogResult = 'closed';

function PendingApprovalDialogImpl(props: PendingApprovalDialogProps) {
  const modal = useModal();
  const { registration, onRefresh } = props;

  const isPending = registration.status === 'pending';

  const handleClose = () => {
    modal.hide();
  };

  const handleRefresh = () => {
    onRefresh?.();
    modal.hide();
  };

  return (
    <Dialog open={modal.visible} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPending ? (
              <>
                <Clock className="h-5 w-5 text-amber-500" />
                Registration Pending
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                Registration Rejected
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isPending
              ? 'Your registration is awaiting administrator approval.'
              : 'Unfortunately, your registration was not approved.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isPending ? (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertTitle>What happens next?</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  An administrator will review your registration for workspace "
                  <strong>{registration.workspace_name}</strong>".
                </p>
                <p>
                  You'll receive access to the platform once your registration is
                  approved. This usually takes less than 24 hours.
                </p>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Registration Rejected</AlertTitle>
              <AlertDescription className="space-y-2">
                {registration.rejection_reason ? (
                  <p>
                    <strong>Reason:</strong> {registration.rejection_reason}
                  </p>
                ) : (
                  <p>
                    Your registration for workspace "
                    <strong>{registration.workspace_name}</strong>" was not approved.
                  </p>
                )}
                <p className="mt-2">
                  If you believe this was a mistake, please contact support.
                </p>
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>Registered email: {registration.email}</span>
          </div>
        </div>

        <DialogFooter>
          {isPending && (
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Check Status
            </Button>
          )}
          <Button onClick={handleClose}>
            {isPending ? 'OK, I understand' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Export with NiceModal registration
export const PendingApprovalDialog = defineModal<
  PendingApprovalDialogProps,
  PendingApprovalDialogResult
>(PendingApprovalDialogImpl);
