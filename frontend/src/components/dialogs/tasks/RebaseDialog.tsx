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
import BranchSelector from '@/components/tasks/BranchSelector';
import type { GitBranch } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface RebaseDialogProps {
  branches: GitBranch[];
  isRebasing?: boolean;
}

export type RebaseDialogResult = {
  action: 'confirmed' | 'canceled';
  branchName?: string;
};

export const RebaseDialog = NiceModal.create<RebaseDialogProps>(
  ({ branches, isRebasing = false }) => {
    const modal = useModal();
    const [selectedBranch, setSelectedBranch] = useState<string>('');

    const handleConfirm = () => {
      if (selectedBranch) {
        modal.resolve({
          action: 'confirmed',
          branchName: selectedBranch,
        } as RebaseDialogResult);
        modal.hide();
      }
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as RebaseDialogResult);
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
            <DialogTitle>Rebase Task Attempt</DialogTitle>
            <DialogDescription>
              Choose a new base branch to rebase this task attempt onto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="base-branch" className="text-sm font-medium">
                Base Branch
              </label>
              <BranchSelector
                branches={branches}
                selectedBranch={selectedBranch}
                onBranchSelect={setSelectedBranch}
                placeholder="Select a base branch"
                excludeCurrentBranch={false}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isRebasing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isRebasing || !selectedBranch}
            >
              {isRebasing ? 'Rebasing...' : 'Rebase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
