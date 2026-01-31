import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Eye,
  Box,
  Brain,
  Terminal,
  Timer,
  Minimize2,
  Maximize2,
  StopCircle,
  Copy,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTask, Sandbox } from './types';
import { extractTaskMetadata, formatDuration } from './types';
import { TASK_STATUS_CONFIG } from './constants';

interface SwarmMonitorProps {
  task: SwarmTask | null;
  sandbox?: Sandbox | null;
  logs: string[];
  isMinimized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onCopyLogs?: () => void;
}

export function SwarmMonitor({
  task,
  sandbox,
  logs,
  isMinimized = false,
  onMinimize,
  onMaximize,
  onCancel,
  onRetry,
  onCopyLogs,
}: SwarmMonitorProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  if (!task) {
    return (
      <div className="border rounded-lg p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">Select a task to monitor execution</span>
        </div>
      </div>
    );
  }

  const metadata = extractTaskMetadata(task.description);
  const config = TASK_STATUS_CONFIG[task.status];
  const StatusIcon = config.icon;
  const isRunning = task.status === 'running';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';

  if (isMinimized) {
    return (
      <div
        className="border rounded-lg p-3 flex items-center justify-between cursor-pointer hover:border-foreground/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onMaximize}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onMaximize?.();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Expandir monitor de ${task.title}`}
      >
        <div className="flex items-center gap-3">
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium text-sm truncate max-w-[200px]">
            {task.title}
          </span>
          <Badge className={cn(config.bgClassName, config.className)}>
            <StatusIcon
              className={cn('h-3 w-3 mr-1', config.animate && 'animate-spin')}
              aria-hidden="true"
            />
            {config.label}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onMaximize?.(); }} aria-label="Expandir monitor">
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium text-sm">{task.title}</span>
          <Badge className={cn(config.bgClassName, config.className)}>
            <StatusIcon
              className={cn('h-3 w-3 mr-1', config.animate && 'animate-spin')}
              aria-hidden="true"
            />
            {config.label}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onMinimize} aria-label="Minimizar monitor">
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Info Bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b text-xs text-muted-foreground">
        {sandbox && (
          <div className="flex items-center gap-1">
            <Box className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">{sandbox.daytona_id.slice(0, 12)}</span>
          </div>
        )}
        {metadata.skill && (
          <div className="flex items-center gap-1">
            <Brain className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{metadata.skill}</span>
          </div>
        )}
        {metadata.cli && (
          <div className="flex items-center gap-1">
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{metadata.cli}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{formatDuration(task.started_at, task.completed_at)}</span>
        </div>
      </div>

      {/* Logs */}
      <div className="h-64 overflow-y-auto bg-background p-3 font-mono text-xs">
        {task.status === 'pending' ? (
          <div className="text-muted-foreground">
            <p>Waiting for execution...</p>
            {task.depends_on && task.depends_on.length > 0 && (
              <p className="mt-2">
                Depends on: {task.depends_on.length} task(s)
              </p>
            )}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-muted-foreground">No logs available</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {log}
            </div>
          ))
        )}

        {/* Result/Error */}
        {isCompleted && task.result && (
          <div className="mt-4 pt-4 border-t border-green-500/20">
            <p className="text-green-500 font-semibold mb-2">Result:</p>
            <p className="whitespace-pre-wrap">{task.result}</p>
          </div>
        )}
        {isFailed && task.error && (
          <div className="mt-4 pt-4 border-t border-destructive/20">
            <p className="text-destructive font-semibold mb-2">Error:</p>
            <p className="whitespace-pre-wrap">{task.error}</p>
          </div>
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between p-3 border-t bg-muted/30">
        <div className="flex items-center gap-2">
          {isRunning && (
            <Button variant="destructive" size="sm" onClick={onCancel}>
              <StopCircle className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Cancel
            </Button>
          )}
          {isFailed && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Retry
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onCopyLogs}>
            <Copy className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Copy
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn(!autoScroll && 'text-muted-foreground')}
        >
          Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
        </Button>
      </div>
    </div>
  );
}
