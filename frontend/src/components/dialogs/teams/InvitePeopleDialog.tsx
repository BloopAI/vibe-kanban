import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Mail, UserPlus, Loader2 } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import type { TeamMemberRole } from 'shared/types';

export interface InvitePeopleDialogProps {
  teamId: string;
  teamName: string;
}

export type InvitePeopleDialogResult = 'invited' | 'canceled';

const ROLE_OPTIONS: { value: TeamMemberRole; label: string; description: string }[] = [
  { value: 'viewer', label: 'Viewer', description: 'Can view issues and documents' },
  { value: 'contributor', label: 'Contributor', description: 'Can create/edit issues and update status' },
  { value: 'maintainer', label: 'Maintainer', description: 'Can manage issues, documents, and assign tasks' },
  { value: 'owner', label: 'Owner', description: 'Full control including team settings and members' },
];

const InvitePeopleDialogImpl = NiceModal.create<InvitePeopleDialogProps>(
  ({ teamId, teamName }) => {
    const modal = useModal();
    const { createInvitation } = useTeamMembers(teamId);

    const [email, setEmail] = useState('');
    const [role, setRole] = useState<TeamMemberRole>('contributor');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validateEmail = (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    const handleSubmit = async () => {
      setError(null);

      if (!email.trim()) {
        setError('Email address is required');
        return;
      }

      if (!validateEmail(email.trim())) {
        setError('Please enter a valid email address');
        return;
      }

      try {
        setIsSubmitting(true);
        await createInvitation({ email: email.trim(), role });
        modal.resolve('invited' as InvitePeopleDialogResult);
        modal.hide();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send invitation');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleClose = () => {
      modal.resolve('canceled' as InvitePeopleDialogResult);
      modal.hide();
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite people to {teamName}
            </DialogTitle>
            <DialogDescription>
              Send an invitation to join this team. They will receive a notification
              and can accept or decline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as TeamMemberRole)}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !email.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Invitation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const InvitePeopleDialog = defineModal(InvitePeopleDialogImpl);
