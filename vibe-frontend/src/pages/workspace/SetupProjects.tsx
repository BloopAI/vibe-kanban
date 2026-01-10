import { useCallback, useState } from 'react';
import { Plus, Trash2, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProjectSetupData, TeamSetupData } from '@/types/workspace';

interface SetupProjectsProps {
  projects: ProjectSetupData[];
  teams: TeamSetupData[];
  onChange: (projects: ProjectSetupData[]) => void;
}

export function SetupProjects({ projects, teams, onChange }: SetupProjectsProps) {
  const [newProjectName, setNewProjectName] = useState('');

  const addProject = useCallback(() => {
    if (!newProjectName.trim()) return;

    const newProject: ProjectSetupData = {
      id: crypto.randomUUID(),
      name: newProjectName.trim(),
      teamId: null,
      description: '',
    };

    onChange([...projects, newProject]);
    setNewProjectName('');
  }, [newProjectName, projects, onChange]);

  const removeProject = useCallback(
    (id: string) => {
      onChange(projects.filter((p) => p.id !== id));
    },
    [projects, onChange]
  );

  const updateProject = useCallback(
    (id: string, updates: Partial<ProjectSetupData>) => {
      onChange(
        projects.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        )
      );
    },
    [projects, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addProject();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderKanban className="h-5 w-5" />
          Create Projects
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Projects contain tasks and issues. You can assign them to teams.
        </p>
      </div>

      {/* Add new project */}
      <div className="flex gap-2">
        <Input
          placeholder="Enter project name (e.g., Mobile App, Website)"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button onClick={addProject} disabled={!newProjectName.trim()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Project
        </Button>
      </div>

      {/* Project list */}
      {projects.length > 0 ? (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-start gap-3 p-3 border rounded-lg bg-card"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded bg-primary/10 text-primary">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <Input
                      value={project.name}
                      onChange={(e) =>
                        updateProject(project.id, { name: e.target.value })
                      }
                      className="h-8 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Team</Label>
                    <Select
                      value={project.teamId || 'none'}
                      onValueChange={(value) =>
                        updateProject(project.id, {
                          teamId: value === 'none' ? null : value,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 mt-1">
                        <SelectValue placeholder="No team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No team</SelectItem>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Description (optional)
                  </Label>
                  <Input
                    value={project.description}
                    onChange={(e) =>
                      updateProject(project.id, { description: e.target.value })
                    }
                    placeholder="Brief description of the project"
                    className="h-8 mt-1"
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeProject(project.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
          <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No projects yet</p>
          <p className="text-sm">Add projects to get started</p>
        </div>
      )}

      {/* Skip hint */}
      <p className="text-sm text-muted-foreground text-center">
        This step is optional. You can skip it and create projects later.
      </p>
    </div>
  );
}
