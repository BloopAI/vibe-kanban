import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, FolderGit, Folder } from 'lucide-react';
import { CreateProject, Project } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { defineModal } from '@/lib/modals';
import { RepoPickerDialog } from '@/components/dialogs/shared/RepoPickerDialog';
import { FolderPickerDialog } from '@/components/dialogs/shared/FolderPickerDialog';

export interface ProjectFormDialogProps {}

export type ProjectFormDialogResult =
  | { status: 'saved'; project: Project }
  | { status: 'canceled' };

type ProjectSourceType = 'choose' | 'git' | 'directory';

const ProjectFormDialogImpl = NiceModal.create<ProjectFormDialogProps>(() => {
  const modal = useModal();
  const [sourceType, setSourceType] = useState<ProjectSourceType>('choose');

  const { createProject } = useProjectMutations({
    onCreateSuccess: (project) => {
      modal.resolve({ status: 'saved', project } as ProjectFormDialogResult);
      modal.hide();
    },
    onCreateError: () => {},
  });
  const createProjectMutate = createProject.mutate;

  const hasStartedGitRef = useRef(false);
  const hasStartedDirRef = useRef(false);

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
        working_directory: null,
      };

      createProjectMutate(createData);
    } else {
      setSourceType('choose');
    }
  }, [createProjectMutate]);

  const handlePickDirectory = useCallback(async () => {
    const selectedPath = await FolderPickerDialog.show({
      title: 'Create Project from Directory',
      description: 'Select a directory for your project',
    });

    if (selectedPath) {
      const dirName = selectedPath.split('/').filter(Boolean).pop() || 'project';

      const createData: CreateProject = {
        name: dirName,
        repositories: [],
        working_directory: selectedPath,
      };

      createProjectMutate(createData);
    } else {
      setSourceType('choose');
    }
  }, [createProjectMutate]);

  useEffect(() => {
    if (!modal.visible) {
      hasStartedGitRef.current = false;
      hasStartedDirRef.current = false;
      setSourceType('choose');
      return;
    }
  }, [modal.visible]);

  useEffect(() => {
    if (!modal.visible) return;

    if (sourceType === 'git' && !hasStartedGitRef.current) {
      hasStartedGitRef.current = true;
      handlePickRepo();
    }

    if (sourceType === 'directory' && !hasStartedDirRef.current) {
      hasStartedDirRef.current = true;
      handlePickDirectory();
    }
  }, [modal.visible, sourceType, handlePickRepo, handlePickDirectory]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      modal.resolve({ status: 'canceled' } as ProjectFormDialogResult);
      modal.hide();
    }
  };

  // Show the choice dialog
  if (sourceType === 'choose') {
    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Choose how to set up your project
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div
              className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
              onClick={() => setSourceType('git')}
            >
              <div className="flex items-start gap-3">
                <FolderGit className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">
                    Git Repository
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Create a project from a git repository with branch tracking
                    and version control
                  </div>
                </div>
              </div>
            </div>

            <div
              className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
              onClick={() => setSourceType('directory')}
            >
              <div className="flex items-start gap-3">
                <Folder className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">
                    Directory
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Create a project from any directory without git version
                    control
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Show creating spinner while mutation is pending
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
