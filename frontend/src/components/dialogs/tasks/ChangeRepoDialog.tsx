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
import RepoSelector from '@/components/tasks/RepoSelector';
import type { Repo } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';

export interface ChangeRepoDialogProps {
  repos: Repo[];
  currentRepoId?: string | null;
}

export type ChangeRepoDialogResult = {
  action: 'confirmed' | 'canceled';
  repoId?: string;
};

const ChangeRepoDialogImpl = NiceModal.create<ChangeRepoDialogProps>(
  ({ repos, currentRepoId }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks', 'common']);
    const [selectedRepoId, setSelectedRepoId] = useState<string>(
      currentRepoId ?? repos[0]?.id ?? ''
    );

    const handleConfirm = () => {
      if (selectedRepoId) {
        modal.resolve({
          action: 'confirmed',
          repoId: selectedRepoId,
        } as ChangeRepoDialogResult);
        modal.hide();
      }
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as ChangeRepoDialogResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={handleOpenChange}
        className="z-[10001]"
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('repos.changeRepo.dialog.title', 'Change Repository')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'repos.changeRepo.dialog.description',
                'Choose a repository for git operations.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="repo-select" className="text-sm font-medium">
                {t('repos.changeRepo.dialog.label', 'Repository')}
              </label>
              <RepoSelector
                repos={repos}
                selectedRepoId={selectedRepoId}
                onRepoSelect={setSelectedRepoId}
                placeholder={t(
                  'repos.changeRepo.dialog.placeholder',
                  'Select a repository'
                )}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {t('common:buttons.cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={!selectedRepoId}>
              {t('repos.changeRepo.dialog.action', 'Change Repository')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const ChangeRepoDialog = defineModal<
  ChangeRepoDialogProps,
  ChangeRepoDialogResult
>(ChangeRepoDialogImpl);
