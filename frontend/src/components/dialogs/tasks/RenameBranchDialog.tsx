import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface RenameBranchDialogProps {
  currentBranchName: string;
  isRenamingBranch?: boolean;
}

export type RenameBranchDialogResult = {
  action: 'confirmed' | 'canceled';
  newBranchName?: string;
};

export const RenameBranchDialog =
  NiceModal.create<RenameBranchDialogProps>(
    ({ currentBranchName, isRenamingBranch = false }) => {
      const modal = useModal();
      const { t } = useTranslation(['tasks', 'common']);
      const [newBranchName, setNewBranchName] = useState<string>(currentBranchName);

      const handleConfirm = () => {
        if (newBranchName && newBranchName !== currentBranchName) {
          modal.resolve({
            action: 'confirmed',
            newBranchName,
          } as RenameBranchDialogResult);
          modal.hide();
        }
      };

      const handleCancel = () => {
        modal.resolve({ action: 'canceled' } as RenameBranchDialogResult);
        modal.hide();
      };

      const handleOpenChange = (open: boolean) => {
        if (!open) {
          handleCancel();
        }
      };

      const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && newBranchName && newBranchName !== currentBranchName) {
          handleConfirm();
        }
      };

      return (
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('branches.rename.dialog.title')}
              </DialogTitle>
              <DialogDescription>
                {t('branches.rename.dialog.description')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="branch-name" className="text-sm font-medium">
                  {t('branches.rename.dialog.label')}
                </label>
                <Input
                  id="branch-name"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('branches.rename.dialog.placeholder')}
                  disabled={isRenamingBranch}
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isRenamingBranch}
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isRenamingBranch || !newBranchName || newBranchName === currentBranchName}
              >
                {isRenamingBranch
                  ? t('branches.rename.dialog.inProgress')
                  : t('branches.rename.dialog.action')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );
