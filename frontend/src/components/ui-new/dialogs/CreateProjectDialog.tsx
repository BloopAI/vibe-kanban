import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WarningIcon } from '@phosphor-icons/react';
import { CreateProject, Project } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { defineModal } from '@/lib/modals';

export interface CreateProjectDialogProps {}

export type CreateProjectDialogResult =
  | { status: 'saved'; project: Project }
  | { status: 'canceled' };

const CreateProjectDialogImpl = NiceModal.create<CreateProjectDialogProps>(
  () => {
    const { t } = useTranslation(['tasks', 'common']);
    const modal = useModal();
    const [name, setName] = useState('');

    const { createProject } = useProjectMutations({
      onCreateSuccess: (project) => {
        modal.resolve({
          status: 'saved',
          project,
        } as CreateProjectDialogResult);
        modal.hide();
      },
      onCreateError: () => {},
    });

    // Reset form when dialog opens
    useEffect(() => {
      if (modal.visible) {
        setName('');
      }
    }, [modal.visible]);

    const handleCreate = () => {
      if (!name.trim()) return;

      const createData: CreateProject = {
        name: name.trim(),
        repositories: [],
      };

      createProject.mutate(createData);
    };

    const handleCancel = () => {
      modal.resolve({ status: 'canceled' } as CreateProjectDialogResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && name.trim() && !createProject.isPending) {
        e.preventDefault();
        handleCreate();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('projects.create.dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('projects.create.dialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="project-name">
              {t('projects.create.form.nameLabel')}
            </Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('projects.create.form.namePlaceholder')}
              autoFocus
              disabled={createProject.isPending}
            />
          </div>

          {createProject.isError && (
            <Alert variant="destructive">
              <WarningIcon className="h-4 w-4" />
              <AlertDescription>
                {createProject.error instanceof Error
                  ? createProject.error.message
                  : t('projects.create.errors.createFailed')}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={createProject.isPending}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createProject.isPending}
            >
              {createProject.isPending
                ? t('common:states.saving')
                : t('common:buttons.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const CreateProjectDialog = defineModal<
  CreateProjectDialogProps,
  CreateProjectDialogResult
>(CreateProjectDialogImpl);
