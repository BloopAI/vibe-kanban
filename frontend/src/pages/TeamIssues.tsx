import { useCallback, useMemo, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Plus, RefreshCw, ListFilter, SlidersHorizontal, CircleDot, PlayCircle, Circle, BarChart3 } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi, teamsApi } from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { openIssueForm } from '@/lib/openIssueForm';

import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeams } from '@/hooks/useTeams';
import { useProjects } from '@/hooks/useProjects';
import { useTeamMembers } from '@/hooks/useTeamMembers';

import { TeamKanbanBoard } from '@/components/tasks/TeamKanbanBoard';
import { InsightsPanel } from '@/components/tasks/InsightsPanel';
import { IssueDetailPanel } from '@/components/tasks/IssueDetailPanel';
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

  const { resolveTeam, isLoading: teamsLoading } = useTeams();
  const team = teamId ? resolveTeam(teamId) : null;
  const { projects } = useProjects();
  const [teamProjectIds, setTeamProjectIds] = useState<string[]>([]);
  const [showInsights, setShowInsights] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  // Use actual team ID for API calls
  const actualTeamId = team?.id;

  // Fetch real team members from database
  const { members } = useTeamMembers(actualTeamId);

  // Transform team members to AssigneeSelector format
  const teamMembers: TeamMember[] = useMemo(() => {
    return members.map((m) => ({
      id: m.id,
      name: m.display_name || m.email.split('@')[0],
      email: m.email,
    }));
  }, [members]);

  // Fetch team projects when team changes
  useEffect(() => {
    if (!actualTeamId) return;
    teamsApi.getProjects(actualTeamId).then(setTeamProjectIds).catch(console.error);
  }, [actualTeamId]);

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
  } = useTeamIssues(actualTeamId);

  const handleCreateIssue = useCallback(() => {
    // Open Linear-style issue form dialog
    // If no team projects, user can select any project from the dialog
    openIssueForm({
      teamId: actualTeamId,
      projectId: teamProjects.length > 0 ? teamProjects[0].id : undefined,
    });
  }, [actualTeamId, teamProjects]);

  // Map project IDs to names for display
  const projectNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);

  const kanbanColumns = useMemo(() => {
    const columns: Record<TaskStatus, { task: TaskWithAttemptStatus; issueKey?: string; projectName?: string }[]> = {
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
  }, [issues, team, projectNamesById]);

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
      // Open inline side panel instead of modal
      setSelectedIssueId(issue.id);
      // Close insights panel when opening issue detail
      setShowInsights(false);
    },
    []
  );

  // Get the selected issue from state
  const selectedIssue = selectedIssueId ? issuesById[selectedIssueId] : null;

  // Generate issue key for selected issue
  const selectedIssueKey = useMemo(() => {
    if (!selectedIssue || !team || selectedIssue.issue_number == null) return undefined;
    const prefix = team.identifier || team.name.slice(0, 3).toUpperCase();
    return `${prefix}-${selectedIssue.issue_number}`;
  }, [selectedIssue, team]);

  // Handle ESC key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIssueId) {
        setSelectedIssueId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIssueId]);

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

  // Handler for project changes - moves issue to a different project
  const handleProjectChange = useCallback(
    async (taskId: string, newProjectId: string) => {
      const issue = issuesById[taskId];
      if (!issue || issue.project_id === newProjectId) return;

      try {
        // Use the tasksApi to move the task to the new project
        await tasksApi.move(taskId, newProjectId);
        await refresh();
      } catch (err) {
        console.error('Failed to move issue to new project:', err);
      }
    },
    [issuesById, refresh]
  );

  // Convert team projects to format expected by dropdown
  const teamProjectsForDropdown = useMemo(() => {
    return teamProjects.map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }, [teamProjects]);

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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => refresh()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={handleCreateIssue}>
              <Plus className="h-4 w-4 mr-1" />
              New Issue
            </Button>
          </div>
        </div>

      </div>

      {/* Sub-header: View tabs + Filter/Insight/Display */}
      <div className="shrink-0 border-b px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left side: View tabs and Filter */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-background border-border gap-1.5"
            >
              <CircleDot className="h-4 w-4" />
              All issues
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-background border-border gap-1.5"
            >
              <PlayCircle className="h-4 w-4" />
              Active
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-background border-border gap-1.5"
            >
              <Circle className="h-4 w-4 opacity-50" strokeDasharray="2 2" />
              Backlog
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5">
              <ListFilter className="h-4 w-4" />
              Filter
            </Button>
          </div>

          {/* Right side: Insight and Display */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${showInsights ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setShowInsights(!showInsights)}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              Display
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Main content area */}
        <div className="flex-1 overflow-auto">
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
                teamProjects={teamProjectsForDropdown}
                onAssigneeChange={handleAssigneeChange}
                onPriorityChange={handlePriorityChange}
                onProjectChange={handleProjectChange}
              />
            </div>
          )}
        </div>

        {/* Insights Panel */}
        {showInsights && (
          <InsightsPanel
            issues={issues}
            onClose={() => setShowInsights(false)}
          />
        )}

        {/* Issue Detail Panel */}
        {selectedIssue && (
          <IssueDetailPanel
            issue={selectedIssue}
            teamId={actualTeamId}
            issueKey={selectedIssueKey}
            onClose={() => setSelectedIssueId(null)}
            onUpdate={refresh}
          />
        )}
      </div>
    </div>
  );
}
