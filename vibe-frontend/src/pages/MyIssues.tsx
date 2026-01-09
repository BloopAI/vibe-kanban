import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Circle, PlayCircle, CircleDot, ListTodo } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import { useUserSystem } from '@/components/ConfigProvider';
import { useTeams } from '@/hooks/useTeams';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { StatusIcon } from '@/utils/statusIcons';
import { cn } from '@/lib/utils';

import type { TaskWithAttemptStatus, TaskStatus, Team } from 'shared/types';

type ViewFilter = 'all' | 'active' | 'backlog';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Backlog',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
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
  const { loginStatus } = useUserSystem();
  const { teams, isLoading: teamsLoading, error: teamsError } = useTeams();
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [allIssues, setAllIssues] = useState<Record<string, TaskWithAttemptStatus[]>>({});

  // Get current user email
  const userEmail = loginStatus?.status === 'loggedin'
    ? loginStatus.profile.email
    : null;

  // Get display name for header
  const userName = useMemo(() => {
    if (loginStatus?.status !== 'loggedin') return null;
    const profile = loginStatus.profile;
    return profile.providers?.[0]?.display_name ||
      profile.username ||
      profile.email?.split('@')[0] ||
      'User';
  }, [loginStatus]);

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

  // Apply view filter
  const filteredIssues = useMemo(() => {
    let result = aggregatedIssues;

    if (viewFilter === 'active') {
      result = result.filter((i) => ['inprogress', 'inreview'].includes(i.status));
    } else if (viewFilter === 'backlog') {
      result = result.filter((i) => i.status === 'todo');
    }

    // Sort by created_at descending (newest first)
    return result.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
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
    <div className="h-full flex flex-col">
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
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">My Issues</h1>
            {userName && (
              <span className="text-muted-foreground">/ {userName}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Sub-header: View tabs */}
      <div className="shrink-0 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 ${viewFilter === 'all' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300' : 'bg-background border-border'}`}
            onClick={() => setViewFilter('all')}
          >
            <CircleDot className="h-4 w-4" />
            All
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {aggregatedIssues.length}
            </Badge>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 ${viewFilter === 'active' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300' : 'bg-background border-border'}`}
            onClick={() => setViewFilter('active')}
          >
            <PlayCircle className="h-4 w-4" />
            Active
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 ${viewFilter === 'backlog' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300' : 'bg-background border-border'}`}
            onClick={() => setViewFilter('backlog')}
          >
            <Circle className="h-4 w-4 opacity-50" strokeDasharray="2 2" />
            Backlog
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {!hasIssues ? (
          <div className="max-w-2xl mx-auto mt-8">
            <Card>
              <CardContent className="text-center py-8">
                <ListTodo className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No issues assigned to you</p>
                <p className="text-sm text-muted-foreground mt-1">
                  When you get assigned to issues, they will appear here
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Render issues grouped by status */}
            {(['inprogress', 'inreview', 'todo', 'done'] as TaskStatus[]).map((status) => {
              const statusIssues = issuesByStatus[status];
              if (statusIssues.length === 0) return null;

              return (
                <div key={status}>
                  <div className="flex items-center gap-2 mb-3">
                    <StatusIcon status={status} />
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {STATUS_LABELS[status]}
                    </h2>
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                      {statusIssues.length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
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

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-150',
        'hover:bg-accent/30 border border-border/50'
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <StatusIcon status={issue.status} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {issueKey && (
                <span className="text-xs font-mono text-muted-foreground">
                  {issueKey}
                </span>
              )}
              {team && (
                <span className="text-xs text-muted-foreground">
                  {team.icon || ''} {team.name}
                </span>
              )}
            </div>
            <h3 className="text-sm font-medium line-clamp-2">{issue.title}</h3>
            {issue.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {issue.description}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
