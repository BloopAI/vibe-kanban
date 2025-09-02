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
import { FolderPicker } from '@/components/ui/folder-picker';
import { TaskTemplateManager } from '@/components/TaskTemplateManager';
import { ProjectFormFields } from './project-form-fields';
import { CreateProject, Project, UpdateProject } from 'shared/types';
import { projectsApi } from '@/lib/api';
import { generateProjectNameFromPath } from '@/utils/string';

interface ProjectFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  project?: Project | null;
}

export function ProjectForm({
  open,
  onClose,
  onSuccess,
  project,
}: ProjectFormProps) {
  const [name, setName] = useState(project?.name || '');
  const [gitRepoPath, setGitRepoPath] = useState(project?.git_repo_path || '');
  const [setupScript, setSetupScript] = useState(project?.setup_script ?? '');
  const [devScript, setDevScript] = useState(project?.dev_script ?? '');
  const [cleanupScript, setCleanupScript] = useState(
    project?.cleanup_script ?? ''
  );
  const [copyFiles, setCopyFiles] = useState(project?.copy_files ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [repoMode, setRepoMode] = useState<'existing' | 'new'>('existing');
  const [parentPath, setParentPath] = useState('');
  const [folderName, setFolderName] = useState('');
  // Removed manual repo preview flow; quick-create on selection instead

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
      onSuccess();
      // Reset form
      setName('');
      setGitRepoPath('');
      setSetupScript('');
      setDevScript('');
      setCleanupScript('');
      setCopyFiles('');
      setParentPath('');
      setFolderName('');
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
        // Use home directory (~) if parentPath is empty
        const effectiveParentPath = parentPath.trim() || '~';
        finalGitRepoPath = `${effectiveParentPath}/${folderName}`.replace(
          /\/+/g,
          '/'
        );
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

        await projectsApi.update(project.id, updateData);
      } else {
        // Creating new project
        // TODO: Compile time check for cloud
        // if (environment === 'cloud') {
        //   // Cloud mode: Create project from GitHub repository
        //   if (!selectedRepository) {
        //     setError('Please select a GitHub repository');
        //     return;
        //   }

        //   const githubData: CreateProjectFromGitHub = {
        //     repository_id: BigInt(selectedRepository.id),
        //     name,
        //     clone_url: selectedRepository.clone_url,
        //     setup_script: setupScript.trim() || null,
        //     dev_script: devScript.trim() || null,
        //     cleanup_script: cleanupScript.trim() || null,
        //   };

        //   await githubApi.createProjectFromRepository(githubData);
        // } else {
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
        // }
      }

      onSuccess();
      // Reset form
      setName('');
      setGitRepoPath('');
      setSetupScript('');
      setDevScript('');
      setCleanupScript('');
      setCopyFiles('');
      setParentPath('');
      setFolderName('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
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
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
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
                  setShowFolderPicker={setShowFolderPicker}
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
            {/*
            TODO: compile time cloud check
            modeLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading...</span>
              </div>
            ) : environment === 'cloud' ? (
              // Cloud mode: Show only GitHub repositories
              <>
                <GitHubRepositoryPicker
                  selectedRepository={selectedRepository}
                  onRepositorySelect={setSelectedRepository}
                  onNameChange={setName}
                  name={name}
                  error={error}
                />


                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="setup-script">
                      Setup Script (optional)
                    </Label>
                    <textarea
                      id="setup-script"
                      placeholder="e.g., npm install"
                      value={setupScript}
                      onChange={(e) => setSetupScript(e.target.value)}
                      className="w-full p-2 border rounded-md resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dev-script">
                      Dev Server Script (optional)
                    </Label>
                    <textarea
                      id="dev-script"
                      placeholder="e.g., npm run dev"
                      value={devScript}
                      onChange={(e) => setDevScript(e.target.value)}
                      className="w-full p-2 border rounded-md resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cleanup-script">
                      Cleanup Script (optional)
                    </Label>
                    <textarea
                      id="cleanup-script"
                      placeholder="e.g., docker-compose down"
                      value={cleanupScript}
                      onChange={(e) => setCleanupScript(e.target.value)}
                      className="w-full p-2 border rounded-md resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              </>
            ) : (*/}

            <ProjectFormFields
              isEditing={isEditing}
              repoMode={repoMode}
              setRepoMode={setRepoMode}
              gitRepoPath={gitRepoPath}
              handleGitRepoPathChange={handleGitRepoPathChange}
              setShowFolderPicker={setShowFolderPicker}
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
              projectId={(project as Project | null | undefined)?.id}
              onCreateProject={handleDirectCreate}
            />
            {/* )} */}
            {repoMode === 'new' && (
              <DialogFooter>
                <Button type="submit" disabled={loading || !folderName.trim()}>
                  {loading ? 'Creating...' : 'Create Project'}
                </Button>
              </DialogFooter>
            )}
          </form>
        )}
      </DialogContent>

      <FolderPicker
        open={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        onSelect={(path) => {
          if (repoMode === 'existing' || isEditing) {
            if (isEditing) {
              // For editing, just set the path
              handleGitRepoPathChange(path);
            } else {
              // For creating, immediately attempt to create project (same as quick select)
              const projectName = generateProjectNameFromPath(path);
              handleDirectCreate(path, projectName);
            }
          } else {
            setParentPath(path);
          }
          setShowFolderPicker(false);
        }}
        value={repoMode === 'existing' || isEditing ? gitRepoPath : parentPath}
        title={
          repoMode === 'existing' || isEditing
            ? 'Select Git Repository'
            : 'Select Parent Directory'
        }
        description={
          repoMode === 'existing' || isEditing
            ? 'Choose an existing git repository'
            : 'Choose where to create the new repository'
        }
      />
    </Dialog>
  );
}
