import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  X,
  BarChart3,
  FileText,
  Maximize2,
  SlidersHorizontal,
  MoreHorizontal,
  Circle,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

interface InsightsPanelProps {
  issues: TaskWithAttemptStatus[];
  onClose: () => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-gray-400',
  inprogress: 'bg-yellow-500',
  inreview: 'bg-blue-500',
  done: 'bg-gray-600',
  cancelled: 'bg-red-500',
};

const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  inprogress: Clock,
  inreview: Circle,
  done: CheckCircle2,
  cancelled: XCircle,
};

const STATUS_ICON_COLORS: Record<TaskStatus, string> = {
  todo: 'text-gray-400',
  inprogress: 'text-yellow-500',
  inreview: 'text-blue-500',
  done: 'text-green-500',
  cancelled: 'text-red-500',
};

export function InsightsPanel({ issues, onClose }: InsightsPanelProps) {
  const [measure] = useState('issue_count');
  const [slice] = useState('status');
  const [segment] = useState('priority');

  // Calculate issue counts by status
  const statusCounts = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      todo: 0,
      inprogress: 0,
      inreview: 0,
      done: 0,
      cancelled: 0,
    };

    issues.forEach((issue) => {
      const status = issue.status.toLowerCase() as TaskStatus;
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    });

    return counts;
  }, [issues]);

  // Calculate issues with no priority by status
  const noPriorityCounts = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      todo: 0,
      inprogress: 0,
      inreview: 0,
      done: 0,
      cancelled: 0,
    };

    issues.forEach((issue) => {
      const status = issue.status.toLowerCase() as TaskStatus;
      if (counts[status] !== undefined && !issue.priority) {
        counts[status]++;
      }
    });

    return counts;
  }, [issues]);

  // Get statuses with issues for display
  const activeStatuses = useMemo(() => {
    return (Object.keys(statusCounts) as TaskStatus[]).filter(
      (status) => statusCounts[status] > 0
    );
  }, [statusCounts]);

  // Get max count for chart scaling
  const maxCount = useMemo(() => {
    return Math.max(...Object.values(statusCounts), 1);
  }, [statusCounts]);

  // Round up to nice number for y-axis
  const yAxisMax = useMemo(() => {
    if (maxCount <= 5) return Math.ceil(maxCount / 2) * 2 || 2;
    if (maxCount <= 10) return Math.ceil(maxCount / 2) * 2;
    if (maxCount <= 20) return Math.ceil(maxCount / 4) * 4;
    return Math.ceil(maxCount / 5) * 5;
  }, [maxCount]);

  // Chart area height in pixels (h-48 = 192px, minus pb-6 = 168px usable)
  const chartHeight = 168;

  return (
    <div className="w-[420px] border-l bg-background flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="p-4 border-b shrink-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Insights makes it easy to analyze issue data. Create reports to
            reveal trends and find outlier issues that need attention.
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Links */}
        <div className="flex items-center gap-4 mt-3">
          <button className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            <BarChart3 className="h-4 w-4" />
            Examples
          </button>
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline">
            <FileText className="h-4 w-4" />
            Documentation
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* Issue count header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold">{issues.length}</span>
            <span className="text-sm text-muted-foreground">issues</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Measure
            </label>
            <Select value={measure}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Measure" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="issue_count">Issue co...</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Slice
            </label>
            <Select value={slice}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Slice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="assignee">Assignee</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Segment
            </label>
            <Select value={segment}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Segment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="assignee">Assignee</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="mb-6">
          <div className="relative h-48 pb-6 border-b border-dashed">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-xs text-muted-foreground text-right pr-2">
              <span>{yAxisMax}</span>
              <span>{Math.round((yAxisMax * 3) / 4)}</span>
              <span>{Math.round(yAxisMax / 2)}</span>
              <span>{Math.round(yAxisMax / 4)}</span>
              <span>0</span>
            </div>

            {/* Horizontal grid lines */}
            <div className="absolute left-10 right-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="border-t border-dashed border-muted-foreground/20 w-full"
                />
              ))}
            </div>

            {/* Bars - positioned absolutely at bottom */}
            <div
              className="absolute left-10 right-4 bottom-6 flex items-end justify-around"
              style={{ height: `${chartHeight}px` }}
            >
              {activeStatuses.map((status) => {
                const count = statusCounts[status];
                const barHeight = Math.round((count / yAxisMax) * chartHeight);
                return (
                  <div
                    key={status}
                    className="flex flex-col items-center"
                    style={{ width: '48px' }}
                  >
                    <div
                      className={`w-10 ${STATUS_COLORS[status]} rounded-t transition-all`}
                      style={{
                        height: `${Math.max(barHeight, count > 0 ? 4 : 0)}px`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* X-axis labels */}
          <div className="flex justify-around mt-2 ml-10 mr-4">
            {activeStatuses.map((status) => (
              <span
                key={status}
                className="text-xs text-muted-foreground text-center"
                style={{ width: '48px' }}
              >
                {STATUS_LABELS[status]}
              </span>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-2">Status</th>
                <th className="text-left font-medium p-2">Issue count</th>
                <th className="text-left font-medium p-2 text-muted-foreground">
                  --- No priority
                </th>
              </tr>
            </thead>
            <tbody>
              {activeStatuses.map((status) => {
                const StatusIcon = STATUS_ICONS[status];
                return (
                  <tr key={status} className="border-b last:border-0">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <StatusIcon
                          className={`h-4 w-4 ${STATUS_ICON_COLORS[status]}`}
                        />
                        <span className="truncate max-w-[80px]">
                          {STATUS_LABELS[status]}
                        </span>
                      </div>
                    </td>
                    <td className="p-2">{statusCounts[status]}</td>
                    <td className="p-2">{noPriorityCounts[status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
