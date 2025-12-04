import { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  Folder,
  Search,
  FolderGit,
  FolderPlus,
  ArrowLeft,
} from 'lucide-react';
// Removed collapsible sections for simplicity; show fields always in edit mode
import { fileSystemApi } from '@/lib/api';
import { FolderPickerDialog } from '@/components/dialogs/shared/FolderPickerDialog';
import { DirectoryEntry } from 'shared/types';
import { generateProjectNameFromPath } from '@/utils/string';

interface ProjectFormFieldsProps {
  repoMode: 'existing' | 'new';
  setRepoMode: (mode: 'existing' | 'new') => void;
  parentPath: string;
  setParentPath: (path: string) => void;
  setFolderName: (name: string) => void;
  setName: (name: string) => void;
  name: string;
  error: string;
  setError: (error: string) => void;
  onCreateProject?: (path: string, name: string) => void;
}

export function ProjectFormFields({
  repoMode,
  setRepoMode,
  parentPath,
  setParentPath,
  setFolderName,
  setName,
  name,
  error,
  setError,
  onCreateProject,
}: ProjectFormFieldsProps) {
  // Repository loading state
  const [allRepos, setAllRepos] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [reposError, setReposError] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showRecentRepos, setShowRecentRepos] = useState(false);

  const loadRecentRepos = useCallback(async () => {
    setLoading(true);
    setReposError('');

    try {
      const discoveredRepos = await fileSystemApi.listGitRepos();
      setAllRepos(discoveredRepos);
    } catch (err) {
      setReposError('Failed to load repositories');
      console.error('Failed to load repos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Lazy-load repositories when the user navigates to the repo list
  useEffect(() => {
    if (showRecentRepos && !loading && allRepos.length === 0) {
      loadRecentRepos();
    }
  }, [showRecentRepos, loading, allRepos.length, loadRecentRepos]);

  return (
    <>
      {repoMode === 'existing' && (
        <div className="space-y-4">
          {/* Show selection interface only when no repo is selected */}
          <>
            {/* Initial choice cards - Stage 1 */}
            {!showRecentRepos && (
              <>
                {/* From Git Repository card */}
                <div
                  className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                  onClick={() => setShowRecentRepos(true)}
                >
                  <div className="flex items-start gap-3">
                    <FolderGit className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">
                        From Git Repository
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Use an existing repository as your project base
                      </div>
                    </div>
                  </div>
                </div>

                {/* Create Blank Project card */}
                <div
                  className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                  onClick={() => {
                    setRepoMode('new');
                    setError('');
                  }}
                >
                  <div className="flex items-start gap-3">
                    <FolderPlus className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">
                        Create Blank Project
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Start a new project from scratch
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Repository selection - Stage 2A */}
            {showRecentRepos && (
              <>
                {/* Back button */}
                <button
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
                  onClick={() => {
                    setShowRecentRepos(false);
                    setError('');
                  }}
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to options
                </button>

                {/* Repository cards */}
                {!loading && allRepos.length > 0 && (
                  <div className="space-y-2">
                    {allRepos
                      .slice(0, showMoreOptions ? allRepos.length : 3)
                      .map((repo) => (
                        <div
                          key={repo.path}
                          className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                          onClick={() => {
                            setError('');
                            const cleanName = generateProjectNameFromPath(
                              repo.path
                            );
                            onCreateProject?.(repo.path, cleanName);
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <FolderGit className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-foreground">
                                {repo.name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate mt-1">
                                {repo.path}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                    {/* Show more/less for repositories */}
                    {!showMoreOptions && allRepos.length > 3 && (
                      <button
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
                        onClick={() => setShowMoreOptions(true)}
                      >
                        Show {allRepos.length - 3} more repositories
                      </button>
                    )}
                    {showMoreOptions && allRepos.length > 3 && (
                      <button
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
                        onClick={() => setShowMoreOptions(false)}
                      >
                        Show less
                      </button>
                    )}
                  </div>
                )}

                {/* Loading state */}
                {loading && (
                  <div className="p-4 border rounded-lg bg-card">
                    <div className="flex items-center gap-3">
                      <div className="animate-spin h-5 w-5 border-2 border-muted-foreground border-t-transparent rounded-full"></div>
                      <div className="text-sm text-muted-foreground">
                        Loading repositories...
                      </div>
                    </div>
                  </div>
                )}

                {/* Error state */}
                {!loading && reposError && (
                  <div className="p-4 border border-destructive rounded-lg bg-destructive/5">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                      <div className="text-sm text-destructive">
                        {reposError}
                      </div>
                    </div>
                  </div>
                )}

                {/* Browse for repository card */}
                <div
                  className="p-4 border border-dashed cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                  onClick={async () => {
                    setError('');
                    const selectedPath = await FolderPickerDialog.show({
                      title: 'Select Git Repository',
                      description: 'Choose an existing git repository',
                    });
                    if (selectedPath) {
                      const projectName =
                        generateProjectNameFromPath(selectedPath);
                      if (onCreateProject) {
                        onCreateProject(selectedPath, projectName);
                      }
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Search className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">
                        Search all repos
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Browse and select any repository on your system
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        </div>
      )}

      {/* Blank Project Form */}
      {repoMode === 'new' && (
        <div className="space-y-4">
          {/* Back button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRepoMode('existing');
              setError('');
              setName('');
              setParentPath('');
              setFolderName('');
            }}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to options
          </Button>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-project-name">
                Project Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="new-project-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (e.target.value) {
                    setFolderName(
                      e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                        .replace(/[^a-z0-9-]/g, '')
                    );
                  }
                }}
                placeholder="My Awesome Project"
                className="placeholder:text-secondary-foreground placeholder:opacity-100"
                required
              />
              <p className="text-xs text-muted-foreground">
                The folder name will be auto-generated from the project name
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent-path">Parent Directory</Label>
              <div className="flex space-x-2">
                <Input
                  id="parent-path"
                  type="text"
                  value={parentPath}
                  onChange={(e) => setParentPath(e.target.value)}
                  placeholder="Current Directory"
                  className="flex-1 placeholder:text-secondary-foreground placeholder:opacity-100"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    const selectedPath = await FolderPickerDialog.show({
                      title: 'Select Parent Directory',
                      description: 'Choose where to create the new repository',
                      value: parentPath,
                    });
                    if (selectedPath) {
                      setParentPath(selectedPath);
                    }
                  }}
                >
                  <Folder className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to use your current working directory, or specify a
                custom path.
              </p>
            </div>
          </div>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
