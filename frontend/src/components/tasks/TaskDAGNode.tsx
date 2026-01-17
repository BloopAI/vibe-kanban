import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Loader2, XCircle } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { cn } from '@/lib/utils';

export interface TaskNodeData extends Record<string, unknown> {
  task: TaskWithAttemptStatus;
  onViewDetails: (task: TaskWithAttemptStatus) => void;
}

interface TaskDAGNodeProps {
  data: TaskNodeData;
  selected?: boolean;
}

export const TaskDAGNode = memo(function TaskDAGNode({
  data,
  selected,
}: TaskDAGNodeProps) {
  const { task, onViewDetails } = data;

  const statusColors: Record<string, string> = {
    todo: 'border-l-gray-400',
    in_progress: 'border-l-blue-500',
    done: 'border-l-green-500',
  };

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-lg shadow-sm p-3 min-w-[180px] max-w-[240px] cursor-pointer transition-all',
        'border-l-4',
        statusColors[task.status] || 'border-l-gray-400',
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
      onClick={() => onViewDetails(task)}
    >
      {/* Target handle (top) - dependencies point here */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
      />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm text-foreground truncate flex-1">
            {task.title}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {task.has_in_progress_attempt && (
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
            )}
            {task.last_attempt_failed && (
              <XCircle className="h-3 w-3 text-destructive" />
            )}
          </div>
        </div>
        {task.description && (
          <p className="text-xs text-muted-foreground truncate">
            {task.description.length > 50
              ? `${task.description.substring(0, 50)}...`
              : task.description}
          </p>
        )}
      </div>

      {/* Source handle (bottom) - this task depends on others */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </div>
  );
});
