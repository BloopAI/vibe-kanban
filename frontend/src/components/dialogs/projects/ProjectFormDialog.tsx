import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskTemplateManager } from '@/components/TaskTemplateManager';
import { ProjectFormFields } from '@/components/projects/project-form-fields';
import { CreateProject, Project, UpdateProject } from 'shared/types';
import { projectsApi } from '@/lib/api';
import { generateProjectNameFromPath } from '@/utils/string';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface ProjectFormDialogProps {
  project?: Project | null;
}

export type ProjectFormDialogResult = 'saved' | 'canceled';

export const ProjectFormDialog = NiceModal.create<ProjectFormDialogProps>(
  ({ project }) => {
    const modal = useModal();
    const [name, setName] = useState(project?.name || '');
    const [gitRepoPath, setGitRepoPath] = useState(
      project?.git_repo_path || ''
    );
    const [setupScript, setSetupScript] = useState(project?.setup_script ?? '');
    const [devScript, setDevScript] = useState(project?.dev_script ?? '');
    const [cleanupScript, setCleanupScript] = useState(
      project?.cleanup_script ?? ''
    );
    const [copyFiles, setCopyFiles] = useState(project?.copy_files ?? '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [repoMode, setRepoMode] = useState<'existing' | 'new'>('existing');
    const [parentPath, setParentPath] = useState('');
    const [folderName, setFolderName] = useState('');

    const isEditing = !!project;

    // Update form fields when project prop changes
    useEffect(() => {
      if (project) {
        setName(project.name || '');
        setGitRepoPath(project.git_repo_path || '');
        setSetupScript(project.setup_script ?? '');
        setDevScript(project.dev_script ?? '');
        setCleanupScript(project.cleanup_script ?? '');
        setCopyFiles(project.copy_files ?? '');
      } else {
        setName('');
        setGitRepoPath('');
        setSetupScript('');
        setDevScript('');
        setCleanupScript('');
        setCopyFiles('');
      }
    }, [project]);

    // Auto-populate project name from directory name
    const handleGitRepoPathChange = (path: string) => {
      setGitRepoPath(path);

      // Only auto-populate name for new projects
      if (!isEditing && path) {
        const cleanName = generateProjectNameFromPath(path);
        if (cleanName) setName(cleanName);
      }
    };

    // Handle direct project creation from repo selection
    const handleDirectCreate = async (path: string, suggestedName: string) => {
      setError('');
      setLoading(true);

      try {
        const createData: CreateProject = {
          name: suggestedName,
          git_repo_path: path,
          use_existing_repo: true,
          setup_script: null,
          dev_script: null,
          cleanup_script: null,
          copy_files: null,
        };

        await projectsApi.create(createData);
        modal.resolve('saved' as ProjectFormDialogResult);
        modal.hide();
      } catch (error) {
        setError(error instanceof Error ? error.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
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

        if (isEditing) {
          const updateData: UpdateProject = {
            name: finalName,
            git_repo_path: finalGitRepoPath,
            setup_script: setupScript.trim() || null,
            dev_script: devScript.trim() || null,
            cleanup_script: cleanupScript.trim() || null,
            copy_files: copyFiles.trim() || null,
          };

          await projectsApi.update(project!.id, updateData);
        } else {
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

          await projectsApi.create(createData);
        }

        modal.resolve('saved' as ProjectFormDialogResult);
        modal.hide();
      } catch (error) {
        setError(error instanceof Error ? error.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    const handleCancel = () => {
      // Reset form
      if (project) {
        setName(project.name || '');
        setGitRepoPath(project.git_repo_path || '');
        setSetupScript(project.setup_script ?? '');
        setDevScript(project.dev_script ?? '');
        setCopyFiles(project.copy_files ?? '');
      } else {
        setName('');
        setGitRepoPath('');
        setSetupScript('');
        setDevScript('');
        setCopyFiles('');
      }
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
            <DialogTitle>
              {isEditing ? 'Edit Project' : 'Create Project'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Make changes to your project here. Click save when you're done."
                : 'Choose your repository source'}
            </DialogDescription>
          </DialogHeader>

          <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-1">
            {isEditing ? (
              <Tabs defaultValue="general" className="w-full -mt-2">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="templates">Task Templates</TabsTrigger>
                </TabsList>
                <TabsContent value="general" className="space-y-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <ProjectFormFields
                      isEditing={isEditing}
                      repoMode={repoMode}
                      setRepoMode={setRepoMode}
                      gitRepoPath={gitRepoPath}
                      handleGitRepoPathChange={handleGitRepoPathChange}
                      parentPath={parentPath}
                      setParentPath={setParentPath}
                      setFolderName={setFolderName}
                      setName={setName}
                      name={name}
                      setupScript={setupScript}
                      setSetupScript={setSetupScript}
                      devScript={devScript}
                      setDevScript={setDevScript}
                      cleanupScript={cleanupScript}
                      setCleanupScript={setCleanupScript}
                      copyFiles={copyFiles}
                      setCopyFiles={setCopyFiles}
                      error={error}
                      setError={setError}
                      projectId={project ? project.id : undefined}
                    />
                    <DialogFooter>
                      <Button
                        type="submit"
                        disabled={loading || !gitRepoPath.trim()}
                      >
                        {loading ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>
                <TabsContent value="templates" className="mt-0 pt-0">
                  <TaskTemplateManager
                    projectId={project ? project.id : undefined}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <ProjectFormFields
                  isEditing={isEditing}
                  repoMode={repoMode}
                  setRepoMode={setRepoMode}
                  gitRepoPath={gitRepoPath}
                  handleGitRepoPathChange={handleGitRepoPathChange}
                  parentPath={parentPath}
                  setParentPath={setParentPath}
                  setFolderName={setFolderName}
                  setName={setName}
                  name={name}
                  setupScript={setupScript}
                  setSetupScript={setSetupScript}
                  devScript={devScript}
                  setDevScript={setDevScript}
                  cleanupScript={cleanupScript}
                  setCleanupScript={setCleanupScript}
                  copyFiles={copyFiles}
                  setCopyFiles={setCopyFiles}
                  error={error}
                  setError={setError}
                  projectId={undefined}
                  onCreateProject={handleDirectCreate}
                />
                {repoMode === 'new' && (
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={loading || !folderName.trim()}
                    >
                      {loading ? 'Creating...' : 'Create Project'}
                    </Button>
                  </DialogFooter>
                )}
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);
