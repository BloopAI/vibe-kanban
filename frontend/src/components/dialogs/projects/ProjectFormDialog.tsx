import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProjectFormFields } from '@/components/projects/project-form-fields';
import { CreateProject } from 'shared/types';
import { generateProjectNameFromPath } from '@/utils/string';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { defineModal } from '@/lib/modals';

export interface ProjectFormDialogProps {
  // No props needed - this is only for creating projects now
}

export type ProjectFormDialogResult = 'saved' | 'canceled';

const ProjectFormDialogImpl = NiceModal.create<ProjectFormDialogProps>(() => {
  const modal = useModal();
  const [name, setName] = useState('');
  const [gitRepoPath, setGitRepoPath] = useState('');
  const [error, setError] = useState('');
  const [repoMode, setRepoMode] = useState<'existing' | 'new'>('existing');
  const [parentPath, setParentPath] = useState('');
  const [folderName, setFolderName] = useState('');

  const { createProject } = useProjectMutations({
    onCreateSuccess: () => {
      modal.resolve('saved' as ProjectFormDialogResult);
      modal.hide();
    },
    onCreateError: (err) => {
      setError(err instanceof Error ? err.message : 'An error occurred');
    },
  });

  // Auto-populate project name from directory name
  const handleGitRepoPathChange = (path: string) => {
    setGitRepoPath(path);

    if (path) {
      const cleanName = generateProjectNameFromPath(path);
      if (cleanName) setName(cleanName);
    }
  };

  // Handle direct project creation from repo selection
  const handleDirectCreate = async (path: string, suggestedName: string) => {
    setError('');

    const createData: CreateProject = {
      name: suggestedName,
      git_repo_path: path,
      use_existing_repo: true,
      setup_script: null,
      dev_script: null,
      cleanup_script: null,
      copy_files: null,
    };

    createProject.mutate(createData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let finalGitRepoPath = gitRepoPath;
    if (repoMode === 'new') {
      const effectiveParentPath = parentPath.trim();
      const cleanFolderName = folderName.trim();
      finalGitRepoPath = effectiveParentPath
        ? `${effectiveParentPath}/${cleanFolderName}`.replace(/\/+/g, '/')
        : cleanFolderName;
    }
    // Auto-populate name from git repo path if not provided
    const finalName =
      name.trim() || generateProjectNameFromPath(finalGitRepoPath);

    // Creating new project
    const createData: CreateProject = {
      name: finalName,
      git_repo_path: finalGitRepoPath,
      use_existing_repo: repoMode === 'existing',
      setup_script: null,
      dev_script: null,
      cleanup_script: null,
      copy_files: null,
    };

    createProject.mutate(createData);
  };

  const handleCancel = () => {
    // Reset form
    setName('');
    setGitRepoPath('');
    setParentPath('');
    setFolderName('');
    setError('');

    modal.resolve('canceled' as ProjectFormDialogResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>Choose your repository source</DialogDescription>
        </DialogHeader>

        <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-1">
          <form onSubmit={handleSubmit} className="space-y-4">
            <ProjectFormFields
              isEditing={false}
              repoMode={repoMode}
              setRepoMode={setRepoMode}
              gitRepoPath={gitRepoPath}
              handleGitRepoPathChange={handleGitRepoPathChange}
              parentPath={parentPath}
              setParentPath={setParentPath}
              setFolderName={setFolderName}
              setName={setName}
              name={name}
              setupScript=""
              setSetupScript={() => {}}
              devScript=""
              setDevScript={() => {}}
              cleanupScript=""
              setCleanupScript={() => {}}
              copyFiles=""
              setCopyFiles={() => {}}
              error={error}
              setError={setError}
              projectId={undefined}
              onCreateProject={handleDirectCreate}
            />
            {repoMode === 'new' && (
              <Button
                type="submit"
                disabled={createProject.isPending || !folderName.trim()}
                className="w-full"
              >
                {createProject.isPending ? 'Creating...' : 'Create Project'}
              </Button>
            )}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export const ProjectFormDialog = defineModal<
  ProjectFormDialogProps,
  ProjectFormDialogResult
>(ProjectFormDialogImpl);
