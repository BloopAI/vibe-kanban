import { useEffect, useState } from 'react';
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
import { defineModal } from '@/lib/modals';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import { attemptKeys } from '@/hooks/useAttempt';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';

export interface RenameWorkspaceDialogProps {
  workspaceId: string;
  currentName: string;
}

export type RenameWorkspaceDialogResult = {
  action: 'confirmed' | 'canceled';
  name?: string;
};

const RenameWorkspaceDialogImpl = NiceModal.create<RenameWorkspaceDialogProps>(
  ({ workspaceId, currentName }) => {
    const modal = useModal();
    const { t } = useTranslation(['common']);
    const queryClient = useQueryClient();
    const [name, setName] = useState<string>(currentName);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      setName(currentName);
      setError(null);
    }, [currentName]);

    const renameMutation = useMutation({
      mutationFn: async (newName: string) => {
        return attemptsApi.update(workspaceId, { name: newName });
      },
      onSuccess: (_, newName) => {
        queryClient.invalidateQueries({
          queryKey: attemptKeys.byId(workspaceId),
        });
        queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
        modal.resolve({
          action: 'confirmed',
          name: newName,
        } as RenameWorkspaceDialogResult);
        modal.hide();
      },
      onError: (err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Failed to rename workspace'
        );
      },
    });

    const handleConfirm = () => {
      const trimmedName = name.trim();

      if (trimmedName === currentName) {
        modal.resolve({ action: 'canceled' } as RenameWorkspaceDialogResult);
        modal.hide();
        return;
      }

      setError(null);
      renameMutation.mutate(trimmedName);
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as RenameWorkspaceDialogResult);
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
            <DialogTitle>{t('workspaces.rename.title')}</DialogTitle>
            <DialogDescription>
              {t('workspaces.rename.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="workspace-name" className="text-sm font-medium">
                {t('workspaces.rename.nameLabel')}
              </label>
              <Input
                id="workspace-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !renameMutation.isPending) {
                    handleConfirm();
                  }
                }}
                placeholder={t('workspaces.rename.placeholder')}
                disabled={renameMutation.isPending}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={renameMutation.isPending}
            >
              {t('buttons.cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={renameMutation.isPending}>
              {renameMutation.isPending
                ? t('workspaces.rename.renaming')
                : t('workspaces.rename.action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const RenameWorkspaceDialog = defineModal<
  RenameWorkspaceDialogProps,
  RenameWorkspaceDialogResult
>(RenameWorkspaceDialogImpl);
