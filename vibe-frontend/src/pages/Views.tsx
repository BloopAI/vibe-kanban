import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Layers,
  Plus,
  ExternalLink,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  PlayCircle,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Calendar,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useTeams } from '@/hooks/useTeams';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { Loader } from '@/components/ui/loader';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus } from 'shared/types';

// Status configuration
const STATUS_CONFIG: Record<string, { icon: typeof Circle; label: string; color: string }> = {
  todo: { icon: Circle, label: 'Todo', color: 'text-muted-foreground' },
  inprogress: { icon: PlayCircle, label: 'In Progress', color: 'text-yellow-500' },
  inreview: { icon: CircleDot, label: 'In Review', color: 'text-blue-500' },
  done: { icon: CheckCircle2, label: 'Done', color: 'text-green-500' },
  cancelled: { icon: XCircle, label: 'Cancelled', color: 'text-muted-foreground' },
};

function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-md text-center px-4">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="w-24 h-24 text-muted-foreground/30">
            <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.5">
              {/* Layered boxes icon similar to Linear */}
              <rect x="20" y="35" width="40" height="30" rx="2" />
              <rect x="30" y="25" width="40" height="30" rx="2" />
              <rect x="40" y="15" width="40" height="30" rx="2" />
              {/* Filter lines */}
              <line x1="25" y1="45" x2="45" y2="45" strokeWidth="2" />
              <line x1="25" y1="52" x2="40" y2="52" strokeWidth="2" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl font-semibold mb-3">Views</h1>

        {/* Description */}
        <p className="text-muted-foreground text-sm mb-2">
          Create custom views using filters to show only the issues you want to see.
          You can save, share, and favorite these views for easy access and faster team collaboration.
        </p>
        <p className="text-muted-foreground text-sm mb-6">
          You can also save any existing view by clicking the{' '}
          <Filter className="inline w-3.5 h-3.5" /> icon or by pressing{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Cmd</kbd>{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">V</kbd>.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => navigate('/views/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Create new view
          </Button>
          <Button variant="outline" asChild>
            <a
              href="https://docs.vibe-kanban.dev/features/views"
              target="_blank"
              rel="noopener noreferrer"
            >
              Documentation
              <ExternalLink className="w-3.5 h-3.5 ml-2" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

interface IssueRowProps {
  issue: TaskWithAttemptStatus;
  projectName?: string;
}

function IssueRow({ issue, projectName }: IssueRowProps) {
  const navigate = useNavigate();
  const status = issue.status?.toLowerCase() || 'todo';
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
  const StatusIcon = statusConfig.icon;

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Get short identifier from issue
  const shortId = (issue as { identifier?: string }).identifier || issue.id.slice(0, 8);

  return (
    <div
      className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-b-0"
      onClick={() => navigate(`/projects/${issue.project_id}/tasks/${issue.id}`)}
    >
      {/* More menu */}
      <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Issue ID */}
      <span className="text-xs text-muted-foreground font-mono w-16 shrink-0">
        {shortId}
      </span>

      {/* Status icon */}
      <StatusIcon className={cn('w-4 h-4 shrink-0', statusConfig.color)} />

      {/* Title */}
      <span className="flex-1 truncate text-sm">{issue.title}</span>

      {/* Project tag */}
      {projectName && (
        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
          {projectName}
        </span>
      )}

      {/* Due date */}
      {issue.due_date && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Calendar className="w-3 h-3" />
          {formatDate(issue.due_date)}
        </span>
      )}
    </div>
  );
}

interface StatusGroupProps {
  status: string;
  issues: TaskWithAttemptStatus[];
  projectNamesById: Record<string, string>;
  defaultExpanded?: boolean;
}

function StatusGroup({ status, issues, projectNamesById, defaultExpanded = true }: StatusGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="mb-2">
      {/* Group header */}
      <button
        className="flex items-center gap-2 px-4 py-2 w-full hover:bg-muted/50 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <StatusIcon className={cn('w-4 h-4', statusConfig.color)} />
        <span className="font-medium text-sm">{statusConfig.label}</span>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
        <div className="flex-1" />
        <Plus className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>

      {/* Issues */}
      {expanded && (
        <div className="ml-6">
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              projectName={projectNamesById[issue.project_id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AllIssuesView() {
  const { teams } = useTeams();
  const { projects } = useProjects();

  // Get all team IDs
  const teamIds = useMemo(() => teams.map((t) => t.id), [teams]);

  // Fetch issues from first team (for demo - in production would aggregate)
  const firstTeamId = teamIds[0];
  const { issues, isLoading } = useTeamIssues(firstTeamId);

  // Project names lookup
  const projectNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);

  // Group issues by status
  const groupedIssues = useMemo(() => {
    const groups: Record<string, TaskWithAttemptStatus[]> = {
      inprogress: [],
      todo: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    issues.forEach((issue) => {
      const status = issue.status?.toLowerCase() || 'todo';
      if (groups[status]) {
        groups[status].push(issue);
      } else {
        groups.todo.push(issue);
      }
    });

    return groups;
  }, [issues]);

  // Order of status groups to display
  const statusOrder = ['inprogress', 'todo', 'inreview', 'done', 'cancelled'];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader message="Loading issues..." />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* View header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="All issues"
              className="bg-transparent border-none outline-none text-lg font-medium placeholder:text-foreground"
              defaultValue="All issues"
            />
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="sm">
            Save to
          </Button>
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
          <Button size="sm">Save</Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Description (optional)
        </p>
      </div>

      {/* Filter bar */}
      <div className="border-b border-border px-4 py-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" className="text-xs">
          Issues
        </Button>
        <Button variant="ghost" size="sm" className="text-xs">
          Projects
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="text-xs">
          <Filter className="w-3 h-3 mr-1" />
          Filter
        </Button>
        <Button variant="ghost" size="sm" className="text-xs">
          <SlidersHorizontal className="w-3 h-3 mr-1" />
          Display
        </Button>
      </div>

      {/* Issues list grouped by status */}
      <div className="py-2">
        {statusOrder.map((status) => {
          const statusIssues = groupedIssues[status] || [];
          if (statusIssues.length === 0) return null;
          return (
            <StatusGroup
              key={status}
              status={status}
              issues={statusIssues}
              projectNamesById={projectNamesById}
            />
          );
        })}

        {/* Empty state if no issues */}
        {issues.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No issues found</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function Views() {
  // For now, show the All Issues view by default
  // In the future, this would check for saved views and show empty state if none exist
  const showAllIssues = true;

  if (!showAllIssues) {
    return <EmptyState />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Views</h1>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-lg">All issues</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Display
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New view
          </Button>
        </div>
      </div>

      <AllIssuesView />
    </div>
  );
}
