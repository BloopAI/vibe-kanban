import { useEffect, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Building2 } from 'lucide-react';
import { useUserSystem } from '@/components/config-provider';
import { useUserOrganizations } from '@/hooks/api/useUserOrganizations';
import { useTranslation } from 'react-i18next';

const OrganizationSwitcherDialog = NiceModal.create(() => {
  const modal = useModal();
  const { t } = useTranslation('common');
  const { loginStatus } = useUserSystem();

  const currentOrgId =
    loginStatus?.status === 'loggedin'
      ? loginStatus.profile.organization_id
      : null;

  const [selection, setSelection] = useState<string | undefined>(
    currentOrgId ?? undefined
  );

  const orgsQuery = useUserOrganizations();

  useEffect(() => {
    if (modal.visible && currentOrgId) {
      setSelection(currentOrgId);
    }
  }, [modal.visible, currentOrgId]);

  const handleClose = () => {
    modal.resolve(null);
    modal.hide();
  };

  // TODO: Add handleSwitch function when backend implements organization switching API
  // For now, dialog just shows organizations without switching capability

  const organizations = orgsQuery.data?.organizations ?? [];
  const hasError = orgsQuery.isError;

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('orgSwitcher.title')}
          </DialogTitle>
          <DialogDescription>{t('orgSwitcher.description')}</DialogDescription>
        </DialogHeader>

        {hasError && (
          <Alert variant="destructive">{t('orgSwitcher.loadError')}</Alert>
        )}

        <div className="space-y-3">
          <Select
            disabled={orgsQuery.isPending || hasError}
            value={selection}
            onValueChange={setSelection}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  orgsQuery.isPending
                    ? 'Loading organizations...'
                    : 'Select an organization'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                  {org.id === currentOrgId ? ' (current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {orgsQuery.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading organizations...
            </div>
          )}
        </div>

        {organizations.length === 0 && !orgsQuery.isPending && !hasError && (
          <Alert>{t('orgSwitcher.noOrganizations')}</Alert>
        )}
      </DialogContent>
    </Dialog>
  );
});

export { OrganizationSwitcherDialog };
