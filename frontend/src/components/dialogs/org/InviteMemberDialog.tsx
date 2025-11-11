import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { organizationsApi } from '@/lib/api';
import { useUserSystem } from '@/components/config-provider';
import { MemberRole } from 'shared/types';

export type InviteMemberResult = {
  action: 'invited' | 'canceled';
};

export const InviteMemberDialog = NiceModal.create(() => {
  const modal = useModal();
  const { loginStatus } = useUserSystem();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>(MemberRole.MEMBER);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Reset form when dialog opens
    if (modal.visible) {
      setEmail('');
      setRole(MemberRole.MEMBER);
      setError(null);
      setIsSubmitting(false);
    }
  }, [modal.visible]);

  const validateEmail = (value: string): string | null => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return 'Email is required';

    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedValue)) {
      return 'Please enter a valid email address';
    }

    return null;
  };

  const handleInvite = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    // Get organization ID from login status
    if (
      loginStatus?.status !== 'loggedin' ||
      !loginStatus.profile?.organization_id
    ) {
      setError('No organization selected');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await organizationsApi.createInvitation(
        loginStatus.profile.organization_id,
        {
          email: email.trim(),
          role: role,
        }
      );

      modal.resolve({ action: 'invited' } as InviteMemberResult);
      modal.hide();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to send invitation'
      );
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    modal.resolve({ action: 'canceled' } as InviteMemberResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="colleague@example.com"
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as MemberRole)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="invite-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MemberRole.MEMBER}>Member</SelectItem>
                <SelectItem value={MemberRole.ADMIN}>Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Admins can manage members and organization settings.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleInvite}
            disabled={!email.trim() || isSubmitting}
          >
            {isSubmitting ? 'Sending...' : 'Send Invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
