import { useCallback, useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Plus } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi, teamsApi } from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { openIssueForm } from '@/lib/openIssueForm';

import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeams } from '@/hooks/useTeams';
import { useProjects } from '@/hooks/useProjects';

import { TeamKanbanBoard } from '@/components/tasks/TeamKanbanBoard';
import type { DragEndEvent } from '@dnd-kit/core';

import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import type { TeamMember } from '@/components/selectors';

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

  // Local state for component labels (frontend-only for now until backend supports it)
  const [componentsByTaskId, setComponentsByTaskId] = useState<Record<string, string | null>>({});

  // Mock team members - in real app, this would come from API
  // Note: IDs must be valid UUIDs as the backend expects UUID for assignee_id
  const teamMembers: TeamMember[] = useMemo(() => [
    { id: '00000000-0000-0000-0000-000000000001', name: 'Alice Johnson', email: 'alice@example.com' },
    { id: '00000000-0000-0000-0000-000000000002', name: 'Bob Smith', email: 'bob@example.com' },
    { id: '00000000-0000-0000-0000-000000000003', name: 'Carol Williams', email: 'carol@example.com' },
    { id: '00000000-0000-0000-0000-000000000004', name: 'David Brown', email: 'david@example.com' },
  ], []);

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
    // Open Linear-style issue form dialog
    // If no team projects, user can select any project from the dialog
    openIssueForm({
      teamId,
      projectId: teamProjects.length > 0 ? teamProjects[0].id : undefined,
    });
  }, [teamId, teamProjects]);

  // Map project IDs to names for display
  const projectNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);

  const kanbanColumns = useMemo(() => {
    const columns: Record<TaskStatus, { task: TaskWithAttemptStatus; issueKey?: string; projectName?: string; component?: string | null }[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    issues.forEach((issue) => {
      const statusKey = normalizeStatus(issue.status);
      // Generate issue key from team identifier and issue_number
      let issueKey: string | undefined;
      if (team && issue.issue_number != null) {
        const prefix = team.identifier || team.name.slice(0, 3).toUpperCase();
        issueKey = `${prefix}-${issue.issue_number}`;
      }
      columns[statusKey].push({
        task: issue,
        issueKey,
        projectName: projectNamesById[issue.project_id],
        component: componentsByTaskId[issue.id] || null,
      });
    });

    // Sort each column by issue_number ascending (lowest first)
    TASK_STATUSES.forEach((status) => {
      columns[status].sort((a, b) => {
        const aNum = a.task.issue_number ?? 0;
        const bNum = b.task.issue_number ?? 0;
        return aNum - bNum;
      });
    });

    return columns;
  }, [issues, team, projectNamesById, componentsByTaskId]);

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
          priority: null,
          due_date: null,
          assignee_id: null,
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

  // Handler for assignee changes
  const handleAssigneeChange = useCallback(
    async (taskId: string, assigneeId: string | null) => {
      const issue = issuesById[taskId];
      if (!issue) return;

      try {
        await tasksApi.update(taskId, {
          title: issue.title,
          description: issue.description,
          status: issue.status,
          parent_workspace_id: issue.parent_workspace_id,
          image_ids: null,
          priority: issue.priority,
          due_date: issue.due_date,
          assignee_id: assigneeId,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update assignee:', err);
      }
    },
    [issuesById, refresh]
  );

  // Handler for priority changes
  const handlePriorityChange = useCallback(
    async (taskId: string, priority: number) => {
      const issue = issuesById[taskId];
      if (!issue) return;

      try {
        await tasksApi.update(taskId, {
          title: issue.title,
          description: issue.description,
          status: issue.status,
          parent_workspace_id: issue.parent_workspace_id,
          image_ids: null,
          priority,
          due_date: issue.due_date,
          assignee_id: issue.assignee_id,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update priority:', err);
      }
    },
    [issuesById, refresh]
  );

  // Handler for component label changes (frontend-only for now)
  const handleComponentChange = useCallback(
    (taskId: string, component: string | null) => {
      setComponentsByTaskId((prev) => ({
        ...prev,
        [taskId]: component,
      }));
      // TODO: When backend supports component field, call API here
    },
    []
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
            <TeamKanbanBoard
              columns={kanbanColumns}
              onDragEnd={handleDragEnd}
              onViewTaskDetails={handleViewIssueDetails}
              onCreateTask={handleCreateIssue}
              selectedTaskId={undefined}
              teamMembers={teamMembers}
              onAssigneeChange={handleAssigneeChange}
              onPriorityChange={handlePriorityChange}
              onComponentChange={handleComponentChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
