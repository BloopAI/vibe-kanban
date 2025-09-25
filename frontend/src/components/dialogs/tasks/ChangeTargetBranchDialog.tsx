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

export interface ChangeTargetBranchDialogProps {
  branches: GitBranch[];
  isChangingTargetBranch?: boolean;
}

export type ChangeTargetBranchDialogResult = {
  action: 'confirmed' | 'canceled';
  branchName?: string;
};

export const ChangeTargetBranchDialog =
  NiceModal.create<ChangeTargetBranchDialogProps>(
    ({ branches, isChangingTargetBranch: isChangingTargetBranch = false }) => {
      const modal = useModal();
      const [selectedBranch, setSelectedBranch] = useState<string>('');

      const handleConfirm = () => {
        if (selectedBranch) {
          modal.resolve({
            action: 'confirmed',
            branchName: selectedBranch,
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
              <DialogTitle>Change target branch</DialogTitle>
              <DialogDescription>
                Choose a new target branch for the task attempt.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="base-branch" className="text-sm font-medium">
                  Target Branch
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
                disabled={isChangingTargetBranch}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isChangingTargetBranch || !selectedBranch}
              >
                {isChangingTargetBranch ? 'Changing...' : 'Change Branch'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );
