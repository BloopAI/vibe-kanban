import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Brain,
  Terminal,
  Eye,
  Box,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTask, Sandbox } from './types';
import { extractTaskMetadata, formatDuration } from './types';
import { TASK_STATUS_CONFIG, PRIORITY_CONFIG } from './constants';

interface TaskCardSwarmProps {
  task: SwarmTask;
  sandbox?: Sandbox | null;
  onViewExecution?: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
}

export function TaskCardSwarm({
  task,
  sandbox,
  onViewExecution,
  onRetry,
}: TaskCardSwarmProps) {
  const metadata = extractTaskMetadata(task.description);
  const config = TASK_STATUS_CONFIG[task.status];
  const priorityConf = PRIORITY_CONFIG[task.priority];
  const StatusIcon = config.icon;

  const isRunning = task.status === 'running';
  const isFailed = task.status === 'failed';

  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-3 transition-colors',
        config.bgClassName,
        isRunning && 'border-blue-500/50'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">{task.title}</h4>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={priorityConf.className} variant="outline">
            {priorityConf.label}
          </Badge>
          <div className={cn('flex items-center gap-1', config.className)}>
            <StatusIcon
              className={cn('h-4 w-4', config.animate && 'animate-spin')}
            />
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-1.5 text-sm">
        {metadata.skill && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Brain className="h-3.5 w-3.5" />
            <span className="font-mono text-xs">{metadata.skill}</span>
          </div>
        )}
        {metadata.cli && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Terminal className="h-3.5 w-3.5" />
            <span className="font-mono text-xs">{metadata.cli}</span>
          </div>
        )}
      </div>

      {/* Running State */}
      {isRunning && sandbox && (
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Box className="h-3.5 w-3.5" />
            <span className="font-mono text-xs">
              {sandbox.daytona_id.slice(0, 12)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{formatDuration(task.started_at, null)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full animate-pulse"
              style={{ width: '65%' }}
            />
          </div>
        </div>
      )}

      {/* Failed State */}
      {isFailed && task.error && (
        <div className="border-t pt-3">
          <p className="text-sm text-destructive line-clamp-2">{task.error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {(isRunning || task.status === 'completed' || isFailed) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewExecution?.(task.id)}
            className="text-xs"
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            View Execution
          </Button>
        )}
        {isFailed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRetry?.(task.id)}
            className="text-xs"
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
