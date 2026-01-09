import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  RefreshCw,
  Circle,
  PlayCircle,
  CircleDot,
  ListTodo,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import { useClerkUser } from '@/hooks/auth/useClerkAuth';
import { useTeams } from '@/hooks/useTeams';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { StatusIcon } from '@/utils/statusIcons';
import { cn } from '@/lib/utils';

import type { TaskWithAttemptStatus, TaskStatus, Team } from 'shared/types';

type ViewFilter = 'all' | 'active' | 'backlog' | 'done';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Backlog',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'text-gray-500',
  inprogress: 'text-yellow-500',
  inreview: 'text-blue-500',
  done: 'text-green-500',
  cancelled: 'text-red-500',
};

// Priority icons and colors
const PRIORITY_CONFIG: Record<number, { icon: typeof AlertCircle; color: string; label: string }> = {
  1: { icon: AlertCircle, color: 'text-red-500', label: 'Urgent' },
  2: { icon: ArrowUp, color: 'text-orange-500', label: 'High' },
  3: { icon: ArrowRight, color: 'text-yellow-500', label: 'Medium' },
  4: { icon: ArrowDown, color: 'text-blue-500', label: 'Low' },
  0: { icon: Minus, color: 'text-muted-foreground', label: 'None' },
};

// Component to fetch and display issues for a single team
function TeamIssuesLoader({
  teamId,
  userMemberId,
  onIssuesLoaded,
}: {
  teamId: string;
  userMemberId: string | null;
  onIssuesLoaded: (teamId: string, issues: TaskWithAttemptStatus[]) => void;
}) {
  const { issues } = useTeamIssues(teamId);

  // Filter to user's assigned issues and call parent callback
  useMemo(() => {
    if (userMemberId) {
      const userIssues = issues.filter((issue) => issue.assignee_id === userMemberId);
      onIssuesLoaded(teamId, userIssues);
    }
  }, [issues, userMemberId, teamId, onIssuesLoaded]);

  return null;
}

export function MyIssues() {
  const navigate = useNavigate();
  const { user } = useClerkUser();
  const { teams, isLoading: teamsLoading, error: teamsError } = useTeams();
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [allIssues, setAllIssues] = useState<Record<string, TaskWithAttemptStatus[]>>({});

  // Get current user email from Clerk (reliable source)
  const userEmail = user?.primaryEmailAddress?.emailAddress || null;

  // Get display name for header from Clerk
  const userName = useMemo(() => {
    if (!user) return null;
    return user.fullName ||
      user.firstName ||
      userEmail?.split('@')[0] ||
      'User';
  }, [user, userEmail]);

  // Handle issues loaded from each team
  const handleIssuesLoaded = useCallback((teamId: string, issues: TaskWithAttemptStatus[]) => {
    setAllIssues((prev) => ({
      ...prev,
      [teamId]: issues,
    }));
  }, []);

  // Aggregate all issues from all teams
  const aggregatedIssues = useMemo(() => {
    const allIssuesList: Array<TaskWithAttemptStatus & { teamId: string }> = [];
    Object.entries(allIssues).forEach(([teamId, issues]) => {
      issues.forEach((issue) => {
        allIssuesList.push({ ...issue, teamId });
      });
    });
    return allIssuesList;
  }, [allIssues]);

  // Count by filter type
  const counts = useMemo(() => ({
    all: aggregatedIssues.length,
    active: aggregatedIssues.filter((i) => ['inprogress', 'inreview'].includes(i.status)).length,
    backlog: aggregatedIssues.filter((i) => i.status === 'todo').length,
    done: aggregatedIssues.filter((i) => i.status === 'done').length,
  }), [aggregatedIssues]);

  // Apply view filter
  const filteredIssues = useMemo(() => {
    let result = aggregatedIssues;

    if (viewFilter === 'active') {
      result = result.filter((i) => ['inprogress', 'inreview'].includes(i.status));
    } else if (viewFilter === 'backlog') {
      result = result.filter((i) => i.status === 'todo');
    } else if (viewFilter === 'done') {
      result = result.filter((i) => i.status === 'done');
    }

    // Sort: active issues by priority, then by created_at
    return result.sort((a, b) => {
      // Active issues first, sorted by priority
      if (a.status !== 'done' && b.status !== 'done') {
        const priorityA = a.priority ?? 0;
        const priorityB = b.priority ?? 0;
        if (priorityA !== priorityB) {
          // Lower priority number = higher priority (1 is urgent)
          return (priorityA || 5) - (priorityB || 5);
        }
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [aggregatedIssues, viewFilter]);

  // Group by status for display
  const issuesByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, typeof filteredIssues> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    filteredIssues.forEach((issue) => {
      grouped[issue.status]?.push(issue);
    });

    return grouped;
  }, [filteredIssues]);

  const handleRefresh = useCallback(() => {
    setAllIssues({});
  }, []);

  const handleIssueClick = useCallback((issue: TaskWithAttemptStatus & { teamId: string }) => {
    navigate(`/teams/${issue.teamId}/issues`);
  }, [navigate]);

  if (teamsLoading) {
    return <Loader message="Loading teams..." size={32} className="py-8" />;
  }

  if (teamsError) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Error
          </AlertTitle>
          <AlertDescription>
            {teamsError.message || 'Failed to load teams'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Not signed in
          </AlertTitle>
          <AlertDescription>
            Please sign in to view your issues.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hasIssues = filteredIssues.length > 0;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Load issues from each team using team members to find current user */}
      {teams.map((team) => (
        <TeamMemberIssueLoader
          key={team.id}
          teamId={team.id}
          userEmail={userEmail}
          onIssuesLoaded={handleIssuesLoaded}
        />
      ))}

      {/* Header */}
      <div className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950">
              <ListTodo className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">My Issues</h1>
              {userName && (
                <p className="text-sm text-muted-foreground">{userName}</p>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="shrink-0 border-b bg-muted/30 px-6 py-3">
        <div className="flex items-center gap-2 max-w-6xl mx-auto">
          <FilterTab
            active={viewFilter === 'all'}
            onClick={() => setViewFilter('all')}
            icon={CircleDot}
            label="All"
            count={counts.all}
          />
          <FilterTab
            active={viewFilter === 'active'}
            onClick={() => setViewFilter('active')}
            icon={PlayCircle}
            label="Active"
            count={counts.active}
            highlight
          />
          <FilterTab
            active={viewFilter === 'backlog'}
            onClick={() => setViewFilter('backlog')}
            icon={Circle}
            label="Backlog"
            count={counts.backlog}
          />
          <FilterTab
            active={viewFilter === 'done'}
            onClick={() => setViewFilter('done')}
            icon={CheckCircle2}
            label="Done"
            count={counts.done}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6">
          {!hasIssues ? (
            <Card className="border-dashed">
              <CardContent className="text-center py-12">
                <div className="p-4 rounded-full bg-muted inline-block mb-4">
                  <ListTodo className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">No issues found</h3>
                <p className="text-sm text-muted-foreground">
                  {viewFilter === 'all'
                    ? 'When you get assigned to issues, they will appear here'
                    : `No ${viewFilter} issues assigned to you`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {/* Render issues grouped by status */}
              {(['inprogress', 'inreview', 'todo', 'done'] as TaskStatus[]).map((status) => {
                const statusIssues = issuesByStatus[status];
                if (statusIssues.length === 0) return null;

                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <StatusIcon status={status} className={cn('h-5 w-5', STATUS_COLORS[status])} />
                      <h2 className="font-medium">
                        {STATUS_LABELS[status]}
                      </h2>
                      <Badge variant="secondary" className="rounded-full">
                        {statusIssues.length}
                      </Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                      {statusIssues.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          teams={teams}
                          onClick={() => handleIssueClick(issue)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Filter tab component
function FilterTab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CircleDot;
  label: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <Button
      variant={active ? 'default' : 'ghost'}
      size="sm"
      onClick={onClick}
      className={cn(
        'gap-2 transition-all',
        active
          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
          : 'hover:bg-muted',
        highlight && !active && count > 0 && 'text-yellow-600 dark:text-yellow-400'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      <Badge
        variant={active ? 'outline' : 'secondary'}
        className={cn(
          'rounded-full h-5 min-w-[20px] px-1.5',
          active && 'bg-white/20 text-white border-white/30'
        )}
      >
        {count}
      </Badge>
    </Button>
  );
}

// Helper component to load team member ID and then issues
function TeamMemberIssueLoader({
  teamId,
  userEmail,
  onIssuesLoaded,
}: {
  teamId: string;
  userEmail: string;
  onIssuesLoaded: (teamId: string, issues: TaskWithAttemptStatus[]) => void;
}) {
  const { members } = useTeamMembers(teamId);

  // Find current user's member ID in this team
  const userMemberId = useMemo(() => {
    const member = members.find((m) => m.email === userEmail);
    return member?.id ?? null;
  }, [members, userEmail]);

  return (
    <TeamIssuesLoader
      teamId={teamId}
      userMemberId={userMemberId}
      onIssuesLoaded={onIssuesLoaded}
    />
  );
}

// Issue card component
function IssueCard({
  issue,
  teams,
  onClick,
}: {
  issue: TaskWithAttemptStatus & { teamId: string };
  teams: Team[];
  onClick: () => void;
}) {
  const team = teams.find((t) => t.id === issue.teamId);
  const issueKey = team && issue.issue_number != null
    ? `${team.identifier || team.name.slice(0, 3).toUpperCase()}-${issue.issue_number}`
    : undefined;

  const priority = issue.priority ?? 0;
  const priorityConfig = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG[0];
  const PriorityIcon = priorityConfig.icon;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200 group',
        'hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800',
        'border-l-4',
        issue.status === 'inprogress' && 'border-l-yellow-500',
        issue.status === 'inreview' && 'border-l-blue-500',
        issue.status === 'todo' && 'border-l-gray-300 dark:border-l-gray-600',
        issue.status === 'done' && 'border-l-green-500'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Top row: Issue key + Team badge */}
            <div className="flex items-center gap-2 mb-2">
              {issueKey && (
                <code className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted">
                  {issueKey}
                </code>
              )}
              {team && (
                <Badge variant="outline" className="text-xs font-normal gap-1">
                  {team.icon && <span>{team.icon}</span>}
                  {team.name}
                </Badge>
              )}
              {priority > 0 && priority <= 2 && (
                <PriorityIcon className={cn('h-4 w-4 ml-auto', priorityConfig.color)} />
              )}
            </div>

            {/* Title */}
            <h3 className="font-medium line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {issue.title}
            </h3>

            {/* Description */}
            {issue.description && (
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                {issue.description}
              </p>
            )}

            {/* Bottom row: metadata */}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(issue.created_at).toLocaleDateString()}
              </span>
              {priority > 0 && (
                <span className={cn('flex items-center gap-1', priorityConfig.color)}>
                  <PriorityIcon className="h-3 w-3" />
                  {priorityConfig.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
