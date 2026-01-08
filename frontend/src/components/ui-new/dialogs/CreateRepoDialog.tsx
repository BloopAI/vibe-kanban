import { useState, useCallback } from 'react';
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
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { FolderSimpleIcon, SpinnerIcon } from '@phosphor-icons/react';
import { defineModal, type NoProps } from '@/lib/modals';
import { repoApi } from '@/lib/api';
import { FolderPickerDialog } from '@/components/dialogs/shared/FolderPickerDialog';
import type { Repo } from 'shared/types';

// Result is the created repo or undefined if canceled
export type CreateRepoResult = Repo | undefined;

const CreateRepoDialogImpl = NiceModal.create<NoProps>(() => {
  const { t } = useTranslation(['tasks', 'common']);
  const modal = useModal();

  const [name, setName] = useState('');
  const [parentPath, setParentPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowseForPath = useCallback(async () => {
    const selectedPath = await FolderPickerDialog.show({
      title: t('git.createRepo.browseDialog.title'),
      description: t('git.createRepo.browseDialog.description'),
      value: parentPath,
    });

    if (selectedPath) {
      setParentPath(selectedPath);
    }
  }, [parentPath, t]);

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('git.createRepo.errors.nameRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const repo = await repoApi.init({
        parent_path: parentPath.trim() || '.',
        folder_name: trimmedName,
      });
      modal.resolve(repo as CreateRepoResult);
      modal.hide();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('git.createRepo.errors.createFailed')
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [name, parentPath, modal, t]);

  const handleCancel = useCallback(() => {
    modal.resolve(undefined as CreateRepoResult);
    modal.hide();
  }, [modal]);

  const canSubmit = name.trim().length > 0;

  return (
    <Dialog open={modal.visible} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('git.createRepo.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('git.createRepo.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Name input */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              {t('git.createRepo.form.nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('git.createRepo.form.namePlaceholder')}
              disabled={isSubmitting}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Location input */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              {t('git.createRepo.form.locationLabel')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={parentPath}
                onChange={(e) => setParentPath(e.target.value)}
                placeholder={t('git.createRepo.form.locationPlaceholder')}
                disabled={isSubmitting}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleBrowseForPath}
                disabled={isSubmitting}
              >
                <FolderSimpleIcon className="h-4 w-4" weight="fill" />
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            {t('common:buttons.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin mr-2" />
                {t('git.createRepo.states.creating')}
              </>
            ) : (
              t('git.createRepo.buttons.createRepository')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const CreateRepoDialog = defineModal<void, CreateRepoResult>(
  CreateRepoDialogImpl
);
