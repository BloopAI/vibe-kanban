import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderPicker } from "@/components/ui/folder-picker";
import { Project, CreateProject, UpdateProject, CreateTaskAndStart } from "shared/types";
import { AlertCircle, Folder, FileCode } from "lucide-react";
import { makeRequest } from "@/lib/api";
import { useConfig } from "@/components/config-provider";

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
  const { config } = useConfig();
  const [name, setName] = useState(project?.name || "");
  const [gitRepoPath, setGitRepoPath] = useState(project?.git_repo_path || "");
  const [setupScript, setSetupScript] = useState(project?.setup_script ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [repoMode, setRepoMode] = useState<"existing" | "new">("existing");
  const [parentPath, setParentPath] = useState("");
  const [folderName, setFolderName] = useState("");
  const [claudeInitLoading, setClaudeInitLoading] = useState(false);
  const [claudeMdExists, setClaudeMdExists] = useState<boolean | null>(null);

  const isEditing = !!project;

  // Update form fields when project prop changes
  useEffect(() => {
    if (project) {
      setName(project.name || "");
      setGitRepoPath(project.git_repo_path || "");
      setSetupScript(project.setup_script ?? "");
    } else {
      setName("");
      setGitRepoPath("");
      setSetupScript("");
    }
  }, [project]);

  // Check for CLAUDE.md existence when project loads and executor is Claude
  useEffect(() => {
    if (project && config && config.executor.type === 'claude' && open) {
      checkClaudeMdExists();
    }
  }, [project, config, open]);

  const checkClaudeMdExists = async () => {
    if (!project) return;
    
    try {
      const response = await makeRequest(`/api/filesystem?path=${encodeURIComponent(project.git_repo_path)}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const claudeMdExists = result.data.some((entry: any) => entry.name === 'CLAUDE.md');
          setClaudeMdExists(claudeMdExists);
        }
      }
    } catch (err) {
      console.error('Failed to check for CLAUDE.md:', err);
    }
  };

  // Auto-populate project name from directory name
  const handleGitRepoPathChange = (path: string) => {
    setGitRepoPath(path);

    // Only auto-populate name for new projects
    if (!isEditing && path) {
      // Extract the last part of the path (directory name)
      const dirName = path.split("/").filter(Boolean).pop() || "";
      if (dirName) {
        // Clean up the directory name for a better project name
        const cleanName = dirName
          .replace(/[-_]/g, " ") // Replace hyphens and underscores with spaces
          .replace(/\b\w/g, (l) => l.toUpperCase()); // Capitalize first letter of each word
        setName(cleanName);
      }
    }
  };

  const handleClaudeInit = async () => {
    if (!project) return;
    
    setClaudeInitLoading(true);
    
    try {
      const payload: CreateTaskAndStart = {
        project_id: project.id,
        title: 'Initialize Project',
        description: '/init',
        executor: { type: 'claude' },
      };

      const response = await makeRequest(
        `/api/projects/${project.id}/tasks/create-and-start`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        // After init task is created, check again for CLAUDE.md
        setTimeout(() => {
          checkClaudeMdExists();
        }, 1000);
      } else {
        setError('Failed to initialize project with Claude');
      }
    } catch (err) {
      setError('Failed to initialize project with Claude');
    } finally {
      setClaudeInitLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let finalGitRepoPath = gitRepoPath;

      // For new repo mode, construct the full path
      if (!isEditing && repoMode === "new") {
        finalGitRepoPath = `${parentPath}/${folderName}`.replace(/\/+/g, "/");
      }

      if (isEditing) {
        const updateData: UpdateProject = {
          name,
          git_repo_path: finalGitRepoPath,
          setup_script: setupScript.trim() || null,
        };
        const response = await makeRequest(
          `/api/projects/${project.id}`,
          {
            method: "PUT",
            body: JSON.stringify(updateData),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to update project");
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "Failed to update project");
        }
      } else {
        const createData: CreateProject = {
          name,
          git_repo_path: finalGitRepoPath,
          use_existing_repo: repoMode === "existing",
          setup_script: setupScript.trim() || null,
        };
        const response = await makeRequest("/api/projects", {
          method: "POST",
          body: JSON.stringify(createData),
        });

        if (!response.ok) {
          throw new Error("Failed to create project");
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "Failed to create project");
        }
      }

      onSuccess();
      setName("");
      setGitRepoPath("");
      setSetupScript("");
      setParentPath("");
      setFolderName("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (project) {
      setName(project.name || "");
      setGitRepoPath(project.git_repo_path || "");
      setSetupScript(project.setup_script ?? "");
    } else {
      setName("");
      setGitRepoPath("");
      setSetupScript("");
    }
    setParentPath("");
    setFolderName("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Project" : "Create New Project"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Make changes to your project here. Click save when you're done."
              : "Choose whether to use an existing git repository or create a new one."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEditing && (
            <div className="space-y-3">
              <Label>Repository Type</Label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="repoMode"
                    value="existing"
                    checked={repoMode === "existing"}
                    onChange={(e) =>
                      setRepoMode(e.target.value as "existing" | "new")
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
                    checked={repoMode === "new"}
                    onChange={(e) =>
                      setRepoMode(e.target.value as "existing" | "new")
                    }
                    className="text-primary"
                  />
                  <span className="text-sm">Create new repository</span>
                </label>
              </div>
            </div>
          )}

          {repoMode === "existing" || isEditing ? (
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
                          .replace(/[-_]/g, " ")
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
              This script will run after creating the worktree and before the executor starts. 
              Use it for setup tasks like installing dependencies or preparing the environment.
            </p>
          </div>

          {isEditing && config && config.executor.type === 'claude' && (
            <div className="space-y-2">
              <Label>Claude Integration</Label>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClaudeInit}
                  disabled={claudeInitLoading}
                  className="text-sm"
                >
                  {claudeInitLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <FileCode className="h-4 w-4 mr-2" />
                      Init Claude
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Initialize Claude with project context and create CLAUDE.md
                </p>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                !name.trim() ||
                (repoMode === "existing" || isEditing
                  ? !gitRepoPath.trim()
                  : !parentPath.trim() || !folderName.trim())
              }
            >
              {loading
                ? "Saving..."
                : isEditing
                ? "Save Changes"
                : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <FolderPicker
        open={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        onSelect={(path) => {
          if (repoMode === "existing" || isEditing) {
            handleGitRepoPathChange(path);
          } else {
            setParentPath(path);
          }
          setShowFolderPicker(false);
        }}
        value={repoMode === "existing" || isEditing ? gitRepoPath : parentPath}
        title={
          repoMode === "existing" || isEditing
            ? "Select Git Repository"
            : "Select Parent Directory"
        }
        description={
          repoMode === "existing" || isEditing
            ? "Choose an existing git repository"
            : "Choose where to create the new repository"
        }
      />
    </Dialog>
  );
}
