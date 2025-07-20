import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Folder } from 'lucide-react';

interface ProjectFormFieldsProps {
  isEditing: boolean;
  repoMode: 'existing' | 'new';
  setRepoMode: (mode: 'existing' | 'new') => void;
  gitRepoPath: string;
  handleGitRepoPathChange: (path: string) => void;
  setShowFolderPicker: (show: boolean) => void;
  parentPath: string;
  setParentPath: (path: string) => void;
  folderName: string;
  setFolderName: (name: string) => void;
  setName: (name: string) => void;
  name: string;
  setupScript: string;
  setSetupScript: (script: string) => void;
  devScript: string;
  setDevScript: (script: string) => void;
  cleanupScript: string;
  setCleanupScript: (script: string) => void;
  error: string;
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
  folderName,
  setFolderName,
  setName,
  name,
  setupScript,
  setSetupScript,
  devScript,
  setDevScript,
  cleanupScript,
  setCleanupScript,
  error,
}: ProjectFormFieldsProps) {
  return (
    <>
      {!isEditing && (
        <div className="space-y-3">
          <Label>Repository Type</Label>
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="repoMode"
                value="existing"
                checked={repoMode === 'existing'}
                onChange={(e) =>
                  setRepoMode(e.target.value as 'existing' | 'new')
                }
                className="text-primary"
              />
              <span className="text-sm">Use existing repository</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="repoMode"
                value="new"
                checked={repoMode === 'new'}
                onChange={(e) =>
                  setRepoMode(e.target.value as 'existing' | 'new')
                }
                className="text-primary"
              />
              <span className="text-sm">Create new repository</span>
            </label>
          </div>
        </div>
      )}

      {repoMode === 'existing' || isEditing ? (
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
          {!isEditing && (
            <p className="text-sm text-muted-foreground">
              Select a folder that already contains a git repository
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="parent-path">Parent Directory</Label>
            <div className="flex space-x-2">
              <Input
                id="parent-path"
                type="text"
                value={parentPath}
                onChange={(e) => setParentPath(e.target.value)}
                placeholder="/path/to/parent/directory"
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
            <p className="text-sm text-muted-foreground">
              Choose where to create the new repository
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="folder-name">Repository Folder Name</Label>
            <Input
              id="folder-name"
              type="text"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                if (e.target.value) {
                  setName(
                    e.target.value
                      .replace(/[-_]/g, ' ')
                      .replace(/\b\w/g, (l) => l.toUpperCase())
                  );
                }
              }}
              placeholder="my-awesome-project"
              required
              className="flex-1"
            />
            <p className="text-sm text-muted-foreground">
              The project name will be auto-populated from this folder name
            </p>
          </div>
        </div>
      )}

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

      <div className="space-y-2">
        <Label htmlFor="setup-script">Setup Script (Optional)</Label>
        <textarea
          id="setup-script"
          value={setupScript}
          onChange={(e) => setSetupScript(e.target.value)}
          placeholder="#!/bin/bash&#10;npm install&#10;# Add any setup commands here..."
          rows={4}
          className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          This script will run after creating the worktree and before the
          executor starts. Use it for setup tasks like installing dependencies
          or preparing the environment.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dev-script">Dev Server Script (Optional)</Label>
        <textarea
          id="dev-script"
          value={devScript}
          onChange={(e) => setDevScript(e.target.value)}
          placeholder="#!/bin/bash&#10;npm run dev&#10;# Add dev server start command here..."
          rows={4}
          className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          This script can be run from task attempts to start a development
          server. Use it to quickly start your project's dev server for testing
          changes.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cleanup-script">Cleanup Script (Optional)</Label>
        <textarea
          id="cleanup-script"
          value={cleanupScript}
          onChange={(e) => setCleanupScript(e.target.value)}
          placeholder="#!/bin/bash&#10;# Add cleanup commands here...&#10;# This runs after coding agent execution"
          rows={4}
          className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          This script will run after coding agent execution is complete. Use it
          for quality assurance tasks like running linters, formatters, tests,
          or other validation steps.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
