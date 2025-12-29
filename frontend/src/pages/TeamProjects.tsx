import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Loader2, AlertCircle, Circle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { useTeamProjects } from '@/hooks/useTeamProjects';
import { useTeams } from '@/hooks/useTeams';
import { useKeyCreate, Scope } from '@/keyboard';
import type { Project } from 'shared/types';
import { format } from 'date-fns';

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog', color: 'bg-gray-400' },
  { value: 'planned', label: 'Planned', color: 'bg-blue-400' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-400' },
  { value: 'paused', label: 'Paused', color: 'bg-orange-400' },
  { value: 'completed', label: 'Completed', color: 'bg-green-400' },
  { value: 'canceled', label: 'Canceled', color: 'bg-red-400' },
];

const PRIORITY_OPTIONS = [
  { value: 0, label: 'No priority', icon: '—' },
  { value: 1, label: 'Urgent', icon: '🔴' },
  { value: 2, label: 'High', icon: '🟠' },
  { value: 3, label: 'Medium', icon: '🟡' },
  { value: 4, label: 'Low', icon: '🟢' },
];

const HEALTH_OPTIONS = [
  { value: 0, label: 'No update', color: 'text-gray-400' },
  { value: 1, label: 'On track', color: 'text-green-500' },
  { value: 2, label: 'At risk', color: 'text-yellow-500' },
  { value: 3, label: 'Off track', color: 'text-red-500' },
];

function getStatusDisplay(status: string | null | undefined) {
  const option = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0];
  return option;
}

function getPriorityDisplay(priority: number | null | undefined) {
  const option = PRIORITY_OPTIONS.find(o => o.value === (priority ?? 0)) || PRIORITY_OPTIONS[0];
  return option;
}

function getHealthDisplay(health: number | null | undefined) {
  const option = HEALTH_OPTIONS.find(o => o.value === (health ?? 0)) || HEALTH_OPTIONS[0];
  return option;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'MMM d');
  } catch {
    return '—';
  }
}

export function TeamProjects() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { projects, isLoading, error } = useTeamProjects(teamId);
  const { teams } = useTeams();

  const team = teams.find(t => t.id === teamId);

  const handleCreateProject = async () => {
    try {
      const result = await ProjectFormDialog.show({ teamId });
      if (result === 'saved') return;
    } catch {
      // User cancelled
    }
  };

  const handleEditProject = async (project: Project) => {
    try {
      await ProjectFormDialog.show({ editProject: project, teamId });
    } catch {
      // User cancelled
    }
  };

  const handleProjectClick = (project: Project) => {
    navigate(`/projects/${project.id}`);
  };

  useKeyCreate(handleCreateProject, { scope: Scope.PROJECTS });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">
            {team?.name || 'Team'} Projects
          </h1>
          <Badge variant="secondary" className="text-xs">
            {projects.length}
          </Badge>
        </div>
        <Button size="sm" onClick={handleCreateProject}>
          <Plus className="h-4 w-4 mr-1" />
          New project
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first project to get started
            </p>
            <Button onClick={handleCreateProject}>
              <Plus className="h-4 w-4 mr-1" />
              New project
            </Button>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-[300px] py-2 px-4">Name</TableHeaderCell>
                <TableHeaderCell className="w-[100px] py-2 px-4">Health</TableHeaderCell>
                <TableHeaderCell className="w-[100px] py-2 px-4">Priority</TableHeaderCell>
                <TableHeaderCell className="w-[120px] py-2 px-4">Lead</TableHeaderCell>
                <TableHeaderCell className="w-[120px] py-2 px-4">Target date</TableHeaderCell>
                <TableHeaderCell className="w-[120px] py-2 px-4">Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((project) => {
                const status = getStatusDisplay(project.status);
                const priority = getPriorityDisplay(project.priority);
                const health = getHealthDisplay(project.health);

                return (
                  <TableRow
                    key={project.id}
                    clickable
                    onClick={() => handleProjectClick(project)}
                  >
                    {/* Name */}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{project.icon || '📁'}</span>
                        <span>{project.name}</span>
                      </div>
                    </TableCell>

                    {/* Health */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                          >
                            <Circle className={`h-2 w-2 fill-current ${health.color}`} />
                            <span className="hidden sm:inline">{health.label}</span>
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {HEALTH_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              onClick={() => handleEditProject({ ...project, health: option.value })}
                            >
                              <Circle className={`h-2 w-2 mr-2 fill-current ${option.color}`} />
                              {option.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    {/* Priority */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                          >
                            <span>{priority.icon}</span>
                            <span className="hidden sm:inline">{priority.label}</span>
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {PRIORITY_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              onClick={() => handleEditProject({ ...project, priority: option.value })}
                            >
                              <span className="mr-2">{option.icon}</span>
                              {option.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    {/* Lead */}
                    <TableCell className="text-muted-foreground text-sm">
                      {project.lead_id ? 'Assigned' : '—'}
                    </TableCell>

                    {/* Target date */}
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(project.target_date)}
                    </TableCell>

                    {/* Status */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                          >
                            <Circle className={`h-2 w-2 fill-current ${status.color}`} />
                            <span>{status.label}</span>
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {STATUS_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              onClick={() => handleEditProject({ ...project, status: option.value })}
                            >
                              <Circle className={`h-2 w-2 mr-2 fill-current ${option.color}`} />
                              {option.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
