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
import BranchSelector from '@/components/tasks/BranchSelector';
import type { GitBranch } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { GitOperationsProvider } from '@/contexts/GitOperationsContext';
import { useGitOperations } from '@/hooks/useGitOperations';

export interface ChangeTargetDialogProps {
  attemptId: string;
  repoId: string;
  branches: GitBranch[];
}

interface ChangeTargetDialogContentProps {
  attemptId: string;
  repoId: string;
  branches: GitBranch[];
}

function ChangeTargetDialogContent({
  attemptId,
  repoId,
  branches,
}: ChangeTargetDialogContentProps) {
  const modal = useModal();
  const { t } = useTranslation(['tasks', 'common']);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const git = useGitOperations(attemptId, repoId);

  const handleConfirm = async () => {
    if (!selectedBranch) return;

    setError(null);
    try {
      await git.actions.changeTargetBranch({
        newTargetBranch: selectedBranch,
        repoId,
      });
      modal.hide();
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to change target branch';
      setError(message);
    }
  };

  const handleCancel = () => {
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  const isLoading = git.states.changeTargetBranchPending;

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('branches.changeTarget.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('branches.changeTarget.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="base-branch" className="text-sm font-medium">
              {t('rebase.dialog.targetLabel')}
            </label>
            <BranchSelector
              branches={branches}
              selectedBranch={selectedBranch}
              onBranchSelect={setSelectedBranch}
              placeholder={t('branches.changeTarget.dialog.placeholder')}
              excludeCurrentBranch={false}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {t('common:buttons.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !selectedBranch}
          >
            {isLoading
              ? t('branches.changeTarget.dialog.inProgress')
              : t('branches.changeTarget.dialog.action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ChangeTargetDialogImpl = NiceModal.create<ChangeTargetDialogProps>(
  ({ attemptId, repoId, branches }) => {
    return (
      <GitOperationsProvider attemptId={attemptId}>
        <ChangeTargetDialogContent
          attemptId={attemptId}
          repoId={repoId}
          branches={branches}
        />
      </GitOperationsProvider>
    );
  }
);

export const ChangeTargetDialog = defineModal<ChangeTargetDialogProps, void>(
  ChangeTargetDialogImpl
);
