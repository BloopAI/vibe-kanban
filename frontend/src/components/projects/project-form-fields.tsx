import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  Folder,
  Search,
  FolderGit,
  PlayCircle,
  Monitor,
  CheckCircle,
  Copy,
  X,
} from 'lucide-react';
import {
  createScriptPlaceholderStrategy,
  ScriptPlaceholderContext,
} from '@/utils/script-placeholders';
import { useUserSystem } from '@/components/config-provider';
import { CopyFilesField } from './copy-files-field';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fileSystemApi } from '@/lib/api';
import { DirectoryEntry } from 'shared/types';
import { generateProjectNameFromPath } from '@/utils/string';

interface ProjectFormFieldsProps {
  isEditing: boolean;
  repoMode: 'existing' | 'new';
  setRepoMode: (mode: 'existing' | 'new') => void;
  gitRepoPath: string;
  handleGitRepoPathChange: (path: string) => void;
  setShowFolderPicker: (show: boolean) => void;
  parentPath: string;
  setParentPath: (path: string) => void;
  setFolderName: (name: string) => void;
  setName: (name: string) => void;
  name: string;
  setupScript: string;
  setSetupScript: (script: string) => void;
  devScript: string;
  setDevScript: (script: string) => void;
  cleanupScript: string;
  setCleanupScript: (script: string) => void;
  copyFiles: string;
  setCopyFiles: (files: string) => void;
  error: string;
  projectId?: string;
  onSelectRepo?: (path: string, name: string) => void;
  selectedPath?: string;
  manualRepo?: DirectoryEntry;
}

export function ProjectFormFields({
  isEditing,
  repoMode,
  setRepoMode,
  gitRepoPath,
  handleGitRepoPathChange,
  setShowFolderPicker,
  parentPath,
  setParentPath,
  setFolderName,
  setName,
  name,
  setupScript,
  setSetupScript,
  devScript,
  setDevScript,
  cleanupScript,
  setCleanupScript,
  copyFiles,
  setCopyFiles,
  error,
  projectId,
  onSelectRepo,
  selectedPath,
  manualRepo,
}: ProjectFormFieldsProps) {
  const { system } = useUserSystem();

  // Create strategy-based placeholders
  const placeholders = system.environment
    ? new ScriptPlaceholderContext(
      createScriptPlaceholderStrategy(system.environment.os_type)
    ).getPlaceholders()
    : {
      setup: '#!/bin/bash\nnpm install\n# Add any setup commands here...',
      dev: '#!/bin/bash\nnpm run dev\n# Add dev server start command here...',
      cleanup:
        '#!/bin/bash\n# Add cleanup commands here...\n# This runs after coding agent execution',
    };

  // Repository loading state
  const [allRepos, setAllRepos] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [reposError, setReposError] = useState('');

  // Load repositories on component mount
  useEffect(() => {
    if (!isEditing) {
      loadRecentRepos();
    }
  }, [isEditing]);

  const loadRecentRepos = async () => {
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
  };

  // Get selected repository info
  const selectedRepo = selectedPath
    ? manualRepo?.path === selectedPath
      ? manualRepo
      : allRepos.find((repo) => repo.path === selectedPath)
    : null;

  return (
    <>
      {!isEditing && (
        <Tabs
          value={repoMode}
          onValueChange={(value) => setRepoMode(value as 'existing' | 'new')}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="existing">From Git</TabsTrigger>
            <TabsTrigger value="new">Blank Project</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-4">
            {onSelectRepo && (
              <div className="space-y-4">
                {/* Show selection interface only when no repo is selected */}
                {!selectedPath && (
                  <>
                    {/* Quick access for top 3 repositories */}
                    {!loading && allRepos.length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-xs text-muted-foreground">
                          Recently used
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                          {allRepos.slice(0, 3).map((repo) => (
                            <Button
                              key={repo.path}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-auto p-3 flex flex-col items-center gap-1 text-xs"
                              onClick={() => {
                                const cleanName = generateProjectNameFromPath(
                                  repo.path
                                );
                                onSelectRepo?.(repo.path, cleanName);
                                setName(cleanName);
                              }}
                              title={repo.path}
                            >
                              <FolderGit className="h-4 w-4" />
                              <span className="truncate max-w-full">
                                {repo.name}
                              </span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Or select from all repositories:
                      </Label>
                      <div className="flex gap-2">
                        <Select
                          value={selectedPath || ''}
                          onValueChange={(path) => {
                            const repo = allRepos.find((r) => r.path === path);
                            if (repo) {
                              const cleanName = generateProjectNameFromPath(
                                repo.path
                              );
                              onSelectRepo?.(repo.path, cleanName);
                              setName(cleanName);
                            }
                          }}
                          disabled={loading}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue
                              placeholder={
                                loading
                                  ? 'Loading repositories...'
                                  : reposError || 'Select a repository'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {allRepos.map((repo) => (
                              <SelectItem key={repo.path} value={repo.path}>
                                <div className="flex items-center gap-2">
                                  <FolderGit className="h-4 w-4" />
                                  <span>{repo.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowFolderPicker(true)}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* Display selected repository */}
                {selectedPath && selectedRepo && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border-2 border-muted-foreground/20 bg-muted/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <FolderGit className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-foreground">
                              {selectedRepo.name}
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-1">
                              {selectedRepo.path}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onSelectRepo?.('', '');
                            setName('');
                          }}
                          title="Clear selection"
                          className="flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="existing-project-name">
                        Project Name
                      </Label>
                      <Input
                        id="existing-project-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Project name"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="new" className="space-y-4">
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
                    placeholder="Home"
                    className="flex-1 placeholder:text-secondary-foreground placeholder:opacity-100"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowFolderPicker(true)}
                  >
                    <Folder className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty to use your home directory, or specify a custom
                  path.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {isEditing && (
        <>
          <div className="space-y-2">
            <Label htmlFor="git-repo-path">Git Repository Path</Label>
            <div className="flex space-x-2">
              <Input
                id="git-repo-path"
                type="text"
                value={gitRepoPath}
                onChange={(e) => handleGitRepoPathChange(e.target.value)}
                placeholder="/path/to/your/existing/repo"
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFolderPicker(true)}
              >
                <Folder className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter project name"
              required
            />
          </div>
        </>
      )}

      <CollapsibleSection
        title="Setup Script"
        icon={<PlayCircle className="h-3 w-3" />}
        defaultOpen={!!setupScript.trim()}
      >
        <div className="space-y-2">
          <textarea
            id="setup-script"
            value={setupScript}
            onChange={(e) => setSetupScript(e.target.value)}
            placeholder={placeholders.setup}
            rows={4}
            className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-sm text-muted-foreground">
            This script will run after creating the worktree and before the
            executor starts. Use it for setup tasks like installing dependencies
            or preparing the environment.
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Dev Server Script"
        icon={<Monitor className="h-3 w-3" />}
        defaultOpen={!!devScript.trim()}
      >
        <div className="space-y-2">
          <textarea
            id="dev-script"
            value={devScript}
            onChange={(e) => setDevScript(e.target.value)}
            placeholder={placeholders.dev}
            rows={4}
            className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-sm text-muted-foreground">
            This script can be run from task attempts to start a development
            server. Use it to quickly start your project's dev server for
            testing changes.
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Cleanup Script"
        icon={<CheckCircle className="h-3 w-3" />}
        defaultOpen={!!cleanupScript.trim()}
      >
        <div className="space-y-2">
          <textarea
            id="cleanup-script"
            value={cleanupScript}
            onChange={(e) => setCleanupScript(e.target.value)}
            placeholder={placeholders.cleanup}
            rows={4}
            className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-sm text-muted-foreground">
            This script runs after coding agent execution{' '}
            <strong>only if changes were made</strong>. Use it for quality
            assurance tasks like running linters, formatters, tests, or other
            validation steps. If no changes are made, this script is skipped.
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Copy Files"
        icon={<Copy className="h-3 w-3" />}
        defaultOpen={!!copyFiles.trim()}
      >
        <div className="space-y-2">
          <CopyFilesField
            value={copyFiles}
            onChange={setCopyFiles}
            projectId={projectId}
          />
          <p className="text-sm text-muted-foreground">
            Comma-separated list of files to copy from the original project
            directory to the worktree. These files will be copied after the
            worktree is created but before the setup script runs. Useful for
            environment-specific files like .env, configuration files, and local
            settings. Make sure these are gitignored or they could get
            committed!
          </p>
        </div>
      </CollapsibleSection>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
