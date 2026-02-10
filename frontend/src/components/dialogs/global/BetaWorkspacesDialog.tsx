import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/lib/modals';
import { useTranslation } from 'react-i18next';

const BetaWorkspacesDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const { t } = useTranslation('common');

  const handleMigrate = () => {
    modal.resolve(true);
  };

  const handleMaybeLater = () => {
    modal.resolve(false);
  };

  return (
    <Dialog open={modal.visible} uncloseable>
      <DialogContent className="sm:max-w-[640px]">
        <img
          src="/beta-workspaces-preview.png"
          alt={t('betaWorkspaces.title')}
          className="w-full rounded-lg border"
        />
        <DialogHeader>
          <DialogTitle className="text-xl">
            {t('betaWorkspaces.title')}
          </DialogTitle>
        </DialogHeader>
        <div className="text-muted-foreground space-y-4">
          <p>{t('betaWorkspaces.intro')}</p>
          <p>{t('betaWorkspaces.newUiDescription')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('betaWorkspaces.newFeatures.multiRepo')}</li>
            <li>{t('betaWorkspaces.newFeatures.multiAgent')}</li>
            <li>{t('betaWorkspaces.newFeatures.commandBar')}</li>
          </ul>
          <p>{t('betaWorkspaces.oldUiDescription')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('betaWorkspaces.oldFeatures.kanban')}</li>
            <li>{t('betaWorkspaces.oldFeatures.settings')}</li>
            <li>{t('betaWorkspaces.oldFeatures.projects')}</li>
          </ul>
          <p>{t('betaWorkspaces.transition')}</p>
          <p>{t('betaWorkspaces.optOutNote')}</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleMaybeLater}>
            {t('betaWorkspaces.maybeLater')}
          </Button>
          <Button onClick={handleMigrate}>{t('orgSwitcher.migrate')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const BetaWorkspacesDialog = defineModal<void, boolean>(
  BetaWorkspacesDialogImpl
);
