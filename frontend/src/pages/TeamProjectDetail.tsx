import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Filter,
  SlidersHorizontal,
  Calendar,
  ArrowRight,
  Users,
  Tag,
  User,
  Check,
  UserPlus,
  Mail,
  GitCommit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTeams } from '@/hooks/useTeams';
import { useProjects } from '@/hooks/useProjects';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { tasksApi } from '@/lib/api';
import { IssueFormDialog } from '@/components/dialogs/issues/IssueFormDialog';
import { StatusIcon } from '@/utils/statusIcons';
import { statusLabels } from '@/utils/statusLabels';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// Status groups in display order
const STATUS_ORDER: TaskStatus[] = ['done', 'inreview', 'inprogress', 'todo', 'cancelled'];

// Priority display
const PRIORITY_DISPLAY = [
  { value: 0, label: 'No priority', dots: '---' },
  { value: 1, label: 'Urgent', dots: '!!!' },
  { value: 2, label: 'High', dots: '.!!' },
  { value: 3, label: 'Medium', dots: '..!' },
  { value: 4, label: 'Low', dots: '...' },
];

// Team member type for assignee dropdown
interface TeamMember {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

// Mock team members - in real app, fetch from API
const MOCK_TEAM_MEMBERS: TeamMember[] = [
  { id: '1', name: 'rupesh panwar', email: 'rupesh@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
  { id: '3', name: 'Bob Johnson', email: 'bob@example.com' },
];

function getPriorityDots(priority: number | null | undefined) {
  const p = PRIORITY_DISPLAY.find((d) => d.value === (priority ?? 0)) || PRIORITY_DISPLAY[0];
  return p.dots;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), 'MMM d');
  } catch {
    return null;
  }
}

// Generate issue key from team identifier and issue number
function getIssueKey(teamIdentifier: string | null | undefined, issueNumber: number | null | undefined) {
  if (!teamIdentifier || !issueNumber) return null;
  return `${teamIdentifier}-${issueNumber}`;
}

interface IssueRowProps {
  issue: TaskWithAttemptStatus;
  teamIdentifier?: string;
  onClick: () => void;
  teamMembers: TeamMember[];
  issueCountPerAssignee: Record<string | 'unassigned', number>;
  onAssigneeChange: (issueId: string, assigneeId: string | null) => void;
}

function IssueRow({ issue, teamIdentifier, onClick, teamMembers, issueCountPerAssignee, onAssigneeChange }: IssueRowProps) {
  const issueKey = getIssueKey(teamIdentifier, issue.issue_number);
  const selectedMember = teamMembers.find((m) => m.id === issue.assignee_id);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleAssigneeSelect = useCallback((assigneeId: string | null) => {
    onAssigneeChange(issue.id, assigneeId);
  }, [issue.id, onAssigneeChange]);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 cursor-pointer border-b border-border/30 last:border-b-0"
    >
      {/* Priority dots */}
      <span className="text-xs text-muted-foreground font-mono w-8">{getPriorityDots(issue.priority)}</span>

      {/* Issue key */}
      {issueKey && (
        <span className="text-xs text-muted-foreground font-mono w-16">{issueKey}</span>
      )}

      {/* Status icon */}
      <StatusIcon status={issue.status} className="h-4 w-4 flex-shrink-0" />

      {/* Title */}
      <span className="flex-1 text-sm truncate">{issue.title}</span>

      {/* Assignee Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button
            className={cn(
              'h-6 w-6 rounded-full flex items-center justify-center',
              'border border-dashed border-muted-foreground/40',
              'text-muted-foreground hover:border-primary hover:text-primary',
              'transition-colors'
            )}
          >
            {selectedMember ? (
              selectedMember.avatar ? (
                <img
                  src={selectedMember.avatar}
                  alt={selectedMember.name}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="text-xs font-medium">{getInitials(selectedMember.name)}</span>
              )
            ) : (
              <User className="h-3 w-3" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
          {/* No assignee option */}
          <DropdownMenuItem
            onClick={() => handleAssigneeSelect(null)}
            className={cn('cursor-pointer gap-2', !issue.assignee_id && 'bg-accent')}
          >
            <div className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
              <User className="h-3 w-3 text-muted-foreground" />
            </div>
            <span className="flex-1">No assignee</span>
            {!issue.assignee_id && <Check className="h-4 w-4 text-primary" />}
            <span className="text-xs text-muted-foreground">{issueCountPerAssignee['unassigned'] || 0}</span>
          </DropdownMenuItem>

          {teamMembers.length > 0 && <DropdownMenuSeparator />}

          {/* Team members */}
          {teamMembers.map((member) => {
            const isSelected = issue.assignee_id === member.id;
            return (
              <DropdownMenuItem
                key={member.id}
                onClick={() => handleAssigneeSelect(member.id)}
                className={cn('cursor-pointer gap-2', isSelected && 'bg-accent')}
              >
                {member.avatar ? (
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-medium flex items-center justify-center text-xs">
                    {getInitials(member.name)}
                  </div>
                )}
                <span className="flex-1 truncate">{member.name}</span>
                {isSelected && <Check className="h-4 w-4 text-primary" />}
                <span className="text-xs text-muted-foreground">{issueCountPerAssignee[member.id] || 0}</span>
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          {/* New user option */}
          <DropdownMenuItem className="cursor-pointer gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <span>New user</span>
          </DropdownMenuItem>

          {/* Invite option */}
          <DropdownMenuItem className="cursor-pointer gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>Invite and assign...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Date */}
      <span className="text-xs text-muted-foreground w-16 text-right">
        {formatDate(issue.created_at)}
      </span>
    </div>
  );
}

interface StatusGroupProps {
  status: TaskStatus;
  issues: TaskWithAttemptStatus[];
  teamIdentifier?: string;
  teamMembers: TeamMember[];
  issueCountPerAssignee: Record<string | 'unassigned', number>;
  onIssueClick: (issue: TaskWithAttemptStatus) => void;
  onAddIssue: () => void;
  onAssigneeChange: (issueId: string, assigneeId: string | null) => void;
}

function StatusGroup({ status, issues, teamIdentifier, teamMembers, issueCountPerAssignee, onIssueClick, onAddIssue, onAssigneeChange }: StatusGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (issues.length === 0) return null;

  return (
    <div className="border-b border-border/50">
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-4 py-2 hover:bg-accent/30 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <StatusIcon status={status} />
        <span className="font-medium text-sm">{statusLabels[status]}</span>
        <span className="text-sm text-muted-foreground">{issues.length}</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onAddIssue();
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Issues */}
      {isExpanded && (
        <div className="bg-muted/20">
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              teamIdentifier={teamIdentifier}
              teamMembers={teamMembers}
              issueCountPerAssignee={issueCountPerAssignee}
              onClick={() => onIssueClick(issue)}
              onAssigneeChange={onAssigneeChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamProjectDetail() {
  const { teamId, projectId } = useParams<{ teamId: string; projectId: string }>();
  const navigate = useNavigate();
  const { teamsById } = useTeams();
  const { projectsById, isLoading: projectsLoading } = useProjects();
  const { issues, isLoading: issuesLoading, refresh: refreshIssues } = useTeamIssues(teamId);
  const [activeTab, setActiveTab] = useState('issues');
  const [activityExpanded, setActivityExpanded] = useState(true);

  const team = teamId ? teamsById[teamId] : null;
  const project = projectId ? projectsById[projectId] : null;

  // Filter issues for this project only
  const projectIssues = useMemo(() => {
    return issues.filter((issue) => issue.project_id === projectId);
  }, [issues, projectId]);

  // Group issues by status
  const issuesByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, TaskWithAttemptStatus[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    projectIssues.forEach((issue) => {
      grouped[issue.status]?.push(issue);
    });

    // Sort by created date descending
    Object.values(grouped).forEach((list) => {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    return grouped;
  }, [projectIssues]);

  // Calculate progress stats
  const stats = useMemo(() => {
    const total = projectIssues.length;
    const done = projectIssues.filter((i) => i.status === 'done').length;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, percentage };
  }, [projectIssues]);

  // Calculate issue count per assignee
  const issueCountPerAssignee = useMemo(() => {
    const counts: Record<string | 'unassigned', number> = { unassigned: 0 };

    projectIssues.forEach((issue) => {
      if (issue.assignee_id) {
        counts[issue.assignee_id] = (counts[issue.assignee_id] || 0) + 1;
      } else {
        counts.unassigned++;
      }
    });

    return counts;
  }, [projectIssues]);

  const handleCreateIssue = async () => {
    try {
      await IssueFormDialog.show({ teamId, projectId });
    } catch {
      // User cancelled
    }
  };

  const handleIssueClick = (issue: TaskWithAttemptStatus) => {
    // Navigate to issue detail (or open dialog)
    navigate(`/projects/${projectId}/tasks/${issue.id}`);
  };

  const handleAssigneeChange = useCallback(async (issueId: string, assigneeId: string | null) => {
    try {
      await tasksApi.update(issueId, {
        title: null,
        description: null,
        status: null,
        parent_workspace_id: null,
        image_ids: null,
        priority: null,
        due_date: null,
        assignee_id: assigneeId,
      });
      await refreshIssues();
    } catch (err) {
      console.error('Failed to update assignee:', err);
    }
  }, [refreshIssues]);

  const isLoading = projectsLoading || issuesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Project not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{team?.icon || '👥'}</span>
          <span
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => navigate(`/teams/${teamId}/projects`)}
          >
            {team?.name}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-lg">{project.icon || '📁'}</span>
          <span className="font-semibold">{project.name}</span>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8">
            <TabsTrigger value="overview" className="text-xs px-3 h-7">
              Overview
            </TabsTrigger>
            <TabsTrigger value="updates" className="text-xs px-3 h-7">
              Updates
            </TabsTrigger>
            <TabsTrigger value="issues" className="text-xs px-3 h-7">
              Issues
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left side - Issues list */}
        <div className="flex-1 flex flex-col overflow-hidden border-r">
          {/* Filter bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              <Filter className="h-3.5 w-3.5" />
              Filter
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Display
            </Button>
          </div>

          {/* Issues grouped by status */}
          <div className="flex-1 overflow-y-auto">
            {STATUS_ORDER.map((status) => (
              <StatusGroup
                key={status}
                status={status}
                issues={issuesByStatus[status]}
                teamIdentifier={team?.identifier || undefined}
                teamMembers={MOCK_TEAM_MEMBERS}
                issueCountPerAssignee={issueCountPerAssignee}
                onIssueClick={handleIssueClick}
                onAddIssue={() => handleCreateIssue()}
                onAssigneeChange={handleAssigneeChange}
              />
            ))}

            {projectIssues.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
                  <Plus className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No issues yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first issue for this project
                </p>
                <Button onClick={() => handleCreateIssue()}>
                  <Plus className="h-4 w-4 mr-1" />
                  New issue
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar - Project details */}
        <div className="w-80 flex-shrink-0 overflow-y-auto bg-muted/10">
          <div className="p-4 space-y-4">
            {/* Priority */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Priority</span>
              <span className="text-sm">
                {project.priority ? PRIORITY_DISPLAY.find((p) => p.value === project.priority)?.label : 'No priority'}
              </span>
            </div>

            {/* Lead */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Lead</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5 mr-1" />
                Add lead
              </Button>
            </div>

            {/* Members */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Members</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5 mr-1" />
                Add members
              </Button>
            </div>

            {/* Dates */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Dates</span>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{formatDate(project.start_date) || 'Start'}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>{formatDate(project.target_date) || 'Target'}</span>
              </div>
            </div>

            {/* Teams */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Teams</span>
              <Badge variant="secondary" className="text-xs">
                {team?.icon} {team?.name}
              </Badge>
            </div>

            {/* Labels */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Labels</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <Tag className="h-3.5 w-3.5 mr-1" />
                Add label
              </Button>
            </div>

            {/* Divider */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Milestones</span>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add milestones to organize work within your project and break it into more granular stages.
              </p>
            </div>

            {/* Progress */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">Progress</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="flex items-center gap-8 mb-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-sm" />
                    Scope
                  </div>
                  <div className="text-lg font-semibold">{stats.total}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-sm" />
                    Completed
                  </div>
                  <div className="text-lg font-semibold">
                    {stats.done}
                    <span className="text-sm text-muted-foreground ml-1">• {stats.percentage}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Assignees breakdown */}
            <div className="border-t pt-4">
              <Tabs defaultValue="assignees" className="w-full">
                <TabsList className="w-full h-8">
                  <TabsTrigger value="assignees" className="flex-1 text-xs h-7">
                    Assignees
                  </TabsTrigger>
                  <TabsTrigger value="labels" className="flex-1 text-xs h-7">
                    Labels
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="mt-3">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
                      <User className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <span className="text-sm text-muted-foreground">No assignee</span>
                  </div>
                  <span className="text-sm">{projectIssues.filter((i) => !i.assignee_id).length}</span>
                </div>
              </div>
            </div>

            {/* Activity Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setActivityExpanded(!activityExpanded)}
                  className="flex items-center gap-1 text-sm font-medium hover:text-foreground"
                >
                  Activity
                  {activityExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <button className="text-xs text-muted-foreground hover:text-foreground">
                  See all
                </button>
              </div>

              {activityExpanded && (
                <div className="space-y-3">
                  {/* Project creation activity */}
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center mt-0.5">
                      <GitCommit className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">rupesh panwar</span>
                        <span className="text-muted-foreground"> created the project</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {project?.created_at ? formatDate(project.created_at.toString()) : 'Unknown date'}
                      </p>
                    </div>
                  </div>

                  {/* Recent issue activities */}
                  {projectIssues.slice(0, 3).map((issue) => (
                    <div key={issue.id} className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center mt-0.5">
                        <Plus className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          <span className="text-muted-foreground">Issue </span>
                          <span className="font-medium">{issue.title}</span>
                          <span className="text-muted-foreground"> created</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(issue.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}

                  {projectIssues.length === 0 && (
                    <p className="text-xs text-muted-foreground">No recent activity</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
