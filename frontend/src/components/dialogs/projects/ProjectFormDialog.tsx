import { useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { CreateProject } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { defineModal } from '@/lib/modals';
import { RepoPickerDialog } from '@/components/dialogs/shared/RepoPickerDialog';

export interface ProjectFormDialogProps {}

export type ProjectFormDialogResult = 'saved' | 'canceled';

const ProjectFormDialogImpl = NiceModal.create<ProjectFormDialogProps>(() => {
  const modal = useModal();

  const { createProject } = useProjectMutations({
    onCreateSuccess: () => {
      modal.resolve('saved' as ProjectFormDialogResult);
      modal.hide();
    },
    onCreateError: () => {},
  });
  const createProjectMutate = createProject.mutate;

  const hasStartedCreateRef = useRef(false);

  const handlePickRepo = useCallback(async () => {
    const repo = await RepoPickerDialog.show({
      title: 'Create Project',
      description: 'Select or create a repository for your project',
    });

    if (repo) {
      const projectName = repo.display_name || repo.name;

      const createData: CreateProject = {
        name: projectName,
        repositories: [{ display_name: projectName, git_repo_path: repo.path }],
      };

      createProjectMutate(createData);
    } else {
      modal.resolve('canceled' as ProjectFormDialogResult);
      modal.hide();
    }
  }, [createProjectMutate, modal]);

  useEffect(() => {
    if (!modal.visible) {
      hasStartedCreateRef.current = false;
      return;
    }

    if (hasStartedCreateRef.current) return;
    hasStartedCreateRef.current = true;
    handlePickRepo();
  }, [modal.visible, handlePickRepo]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      modal.resolve('canceled' as ProjectFormDialogResult);
      modal.hide();
    }
  };

  return (
    <Dialog
      open={modal.visible && createProject.isPending}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Creating Project</DialogTitle>
          <DialogDescription>Setting up your project...</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>

        {createProject.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {createProject.error instanceof Error
                ? createProject.error.message
                : 'Failed to create project'}
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
});

export const ProjectFormDialog = defineModal<
  ProjectFormDialogProps,
  ProjectFormDialogResult
>(ProjectFormDialogImpl);
