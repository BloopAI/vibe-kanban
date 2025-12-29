import { useCallback, useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Plus } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi, teamsApi } from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { openTaskForm } from '@/lib/openTaskForm';

import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeams } from '@/hooks/useTeams';
import { useProjects } from '@/hooks/useProjects';

import TaskKanbanBoard, {
  type KanbanColumnItem,
} from '@/components/tasks/TaskKanbanBoard';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';

import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

const TASK_STATUSES = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
] as const;

const normalizeStatus = (status: string): TaskStatus =>
  status.toLowerCase() as TaskStatus;

export function TeamIssues() {
  const { t } = useTranslation(['tasks', 'common']);
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();

  const { teamsById, isLoading: teamsLoading } = useTeams();
  const team = teamId ? teamsById[teamId] : null;
  const { projects } = useProjects();
  const [teamProjectIds, setTeamProjectIds] = useState<string[]>([]);

  // Fetch team projects when teamId changes
  useEffect(() => {
    if (!teamId) return;
    teamsApi.getProjects(teamId).then(setTeamProjectIds).catch(console.error);
  }, [teamId]);

  // Get the first project that belongs to this team (for issue creation)
  const teamProjects = useMemo(() => {
    return projects.filter((p) => teamProjectIds.includes(p.id));
  }, [projects, teamProjectIds]);

  const {
    issues,
    issuesById,
    isLoading,
    error,
    refresh,
  } = useTeamIssues(teamId);

  const handleCreateIssue = useCallback(() => {
    if (teamProjects.length === 0) {
      // No projects assigned to team - redirect to team projects page
      alert('Please assign a project to this team first.');
      return;
    }
    // Use the first team project for now
    const projectId = teamProjects[0].id;
    openTaskForm({ mode: 'create', projectId, teamId });
  }, [teamId, teamProjects]);

  const kanbanColumns = useMemo(() => {
    const columns: Record<TaskStatus, KanbanColumnItem[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    issues.forEach((issue) => {
      const statusKey = normalizeStatus(issue.status);
      columns[statusKey].push({
        type: 'task',
        task: issue,
        sharedTask: undefined,
      });
    });

    // Sort each column by created_at descending
    TASK_STATUSES.forEach((status) => {
      columns[status].sort((a, b) => {
        const aTime = new Date(a.task.created_at).getTime();
        const bTime = new Date(b.task.created_at).getTime();
        return bTime - aTime;
      });
    });

    return columns;
  }, [issues]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !active.data.current) return;

      const draggedIssueId = active.id as string;
      const newStatus = over.id as TaskStatus;
      const issue = issuesById[draggedIssueId];
      if (!issue || issue.status === newStatus) return;

      try {
        await tasksApi.update(draggedIssueId, {
          title: issue.title,
          description: issue.description,
          status: newStatus,
          parent_workspace_id: issue.parent_workspace_id,
          image_ids: null,
        });
        // Refresh to get updated data
        await refresh();
      } catch (err) {
        console.error('Failed to update issue status:', err);
      }
    },
    [issuesById, refresh]
  );

  const handleViewIssueDetails = useCallback(
    (issue: TaskWithAttemptStatus) => {
      // Navigate to project task view for now
      // In the future, this could be a team-specific view
      navigate(`/projects/${issue.project_id}/tasks/${issue.id}/attempts/latest`);
    },
    [navigate]
  );

  if (error) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('common:states.error')}
          </AlertTitle>
          <AlertDescription>
            {error.message || 'Failed to load team issues'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading || teamsLoading) {
    return <Loader message={t('loading')} size={32} className="py-8" />;
  }

  if (!team) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Team not found
          </AlertTitle>
          <AlertDescription>
            The team you're looking for doesn't exist.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hasIssues = issues.length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{team.icon || '👥'}</span>
            <h1 className="text-lg font-semibold">{team.name}</h1>
            <span className="text-muted-foreground">/ Issues</span>
          </div>
          <Button size="sm" onClick={handleCreateIssue}>
            <Plus className="h-4 w-4 mr-1" />
            New Issue
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {!hasIssues ? (
          <div className="max-w-7xl mx-auto mt-8 px-4">
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">No issues in this team yet</p>
                <Button className="mt-4" onClick={handleCreateIssue}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Issue
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="w-full h-full overflow-x-auto overflow-y-auto overscroll-x-contain p-4">
            <TaskKanbanBoard
              columns={kanbanColumns}
              onDragEnd={handleDragEnd}
              onViewTaskDetails={handleViewIssueDetails}
              onViewSharedTask={() => {}}
              selectedTaskId={undefined}
              selectedSharedTaskId={null}
              onCreateTask={handleCreateIssue}
              projectId={teamId!}
            />
          </div>
        )}
      </div>
    </div>
  );
}
