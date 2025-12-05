import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Button } from '@/components/ui/button';
import BranchSelector from '@/components/tasks/BranchSelector';
import type { GitBranch, Repo, BranchStatus } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';

export interface ChangeTargetBranchDialogProps {
  branches: GitBranch[];
  isChangingTargetBranch?: boolean;
  repos?: Repo[];
  branchStatus?: BranchStatus[];
}

export type ChangeTargetBranchDialogResult = {
  action: 'confirmed' | 'canceled';
  branchName?: string;
  repoId?: string;
};

const ChangeTargetBranchDialogImpl =
  NiceModal.create<ChangeTargetBranchDialogProps>(
    ({
      branches,
      isChangingTargetBranch: isChangingTargetBranch = false,
      repos = [],
      branchStatus = [],
    }) => {
      const modal = useModal();
      const { t } = useTranslation(['tasks', 'common']);
      const [selectedBranch, setSelectedBranch] = useState<string>('');
      const [selectedRepoId, setSelectedRepoId] = useState<string>(
        repos[0]?.id ?? ''
      );

      const isMultiRepo = repos.length > 1;

      const currentTargetBranch = useMemo(() => {
        if (!selectedRepoId || branchStatus.length === 0) return null;
        const idx = repos.findIndex((r) => r.id === selectedRepoId);
        return branchStatus[idx]?.target_branch_name ?? null;
      }, [selectedRepoId, repos, branchStatus]);

      const handleConfirm = () => {
        if (selectedBranch) {
          modal.resolve({
            action: 'confirmed',
            branchName: selectedBranch,
            repoId: selectedRepoId,
          } as ChangeTargetBranchDialogResult);
          modal.hide();
        }
      };

      const handleCancel = () => {
        modal.resolve({ action: 'canceled' } as ChangeTargetBranchDialogResult);
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
              <DialogTitle>
                {t('branches.changeTarget.dialog.title')}
              </DialogTitle>
              <DialogDescription>
                {t('branches.changeTarget.dialog.description')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {isMultiRepo && (
                <div className="space-y-2">
                  <label htmlFor="repo-select" className="text-sm font-medium">
                    {t('branches.changeTarget.dialog.repoLabel', 'Repository')}
                  </label>
                  <Select value={selectedRepoId} onValueChange={setSelectedRepoId}>
                    <SelectTrigger id="repo-select">
                      <SelectValue placeholder="Select repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo.id} value={repo.id}>
                          {repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {currentTargetBranch && (
                    <p className="text-xs text-muted-foreground">
                      Current target: {currentTargetBranch}
                    </p>
                  )}
                </div>
              )}

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
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isChangingTargetBranch}
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isChangingTargetBranch || !selectedBranch || (isMultiRepo && !selectedRepoId)}
              >
                {isChangingTargetBranch
                  ? t('branches.changeTarget.dialog.inProgress')
                  : t('branches.changeTarget.dialog.action')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );

export const ChangeTargetBranchDialog = defineModal<
  ChangeTargetBranchDialogProps,
  ChangeTargetBranchDialogResult
>(ChangeTargetBranchDialogImpl);
