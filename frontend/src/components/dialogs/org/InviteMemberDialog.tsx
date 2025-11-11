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
import { useTranslation } from 'react-i18next';

export type InviteMemberResult = {
  action: 'invited' | 'canceled';
};

export const InviteMemberDialog = NiceModal.create(() => {
  const modal = useModal();
  const { t } = useTranslation();
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
          <DialogTitle>{t('organization.inviteDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('organization.inviteDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">
              {t('organization.inviteDialog.emailLabel')}
            </Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder={t('organization.inviteDialog.emailPlaceholder')}
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">
              {t('organization.inviteDialog.roleLabel')}
            </Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as MemberRole)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="invite-role">
                <SelectValue
                  placeholder={t('organization.inviteDialog.rolePlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MemberRole.MEMBER}>
                  {t('organization.roles.member')}
                </SelectItem>
                <SelectItem value={MemberRole.ADMIN}>
                  {t('organization.roles.admin')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('organization.inviteDialog.roleHelper')}
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
            {t('buttons.cancel')}
          </Button>
          <Button
            onClick={handleInvite}
            disabled={!email.trim() || isSubmitting}
          >
            {isSubmitting
              ? t('organization.inviteDialog.sending')
              : t('organization.inviteDialog.sendButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
