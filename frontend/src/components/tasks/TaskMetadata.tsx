import { cn } from '@/lib/utils';
import type { TaskLabel, TaskPriority } from 'shared/types';
import { CalendarBlank, Flag, Circle } from '@phosphor-icons/react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TaskMetadataProps {
  taskId?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  labels?: TaskLabel[];
  className?: string;
  compact?: boolean;
}

const priorityConfig: Record<
  Exclude<TaskPriority, 'none'>,
  { icon: typeof Flag; label: string; className: string }
> = {
  urgent: {
    icon: Flag,
    label: 'Urgent',
    className: 'text-red-500',
  },
  high: {
    icon: Flag,
    label: 'High',
    className: 'text-orange-500',
  },
  medium: {
    icon: Flag,
    label: 'Medium',
    className: 'text-yellow-500',
  },
  low: {
    icon: Flag,
    label: 'Low',
    className: 'text-blue-400',
  },
};

function formatDueDate(dateStr: string): {
  text: string;
  isOverdue: boolean;
  isToday: boolean;
} {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) {
    return {
      text: `${Math.abs(diffDays)}d overdue`,
      isOverdue: true,
      isToday: false,
    };
  } else if (diffDays === 0) {
    return { text: 'Today', isOverdue: false, isToday: true };
  } else if (diffDays === 1) {
    return { text: 'Tomorrow', isOverdue: false, isToday: false };
  } else if (diffDays < 7) {
    return { text: `${diffDays}d`, isOverdue: false, isToday: false };
  } else {
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return { text: `${month} ${day}`, isOverdue: false, isToday: false };
  }
}

export function TaskMetadata({
  taskId,
  priority,
  dueDate,
  labels,
  className,
  compact = false,
}: TaskMetadataProps) {
  const hasMetadata =
    taskId ||
    (priority && priority !== 'none') ||
    dueDate ||
    (labels && labels.length > 0);

  if (!hasMetadata) return null;

  const priorityInfo =
    priority && priority !== 'none' ? priorityConfig[priority] : null;
  const dueDateInfo = dueDate ? formatDueDate(dueDate) : null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 flex-wrap',
        compact ? 'gap-1.5' : 'gap-2',
        className
      )}
    >
      {/* Task ID */}
      {taskId && (
        <span
          className={cn(
            'font-mono text-muted-foreground',
            compact ? 'text-[10px]' : 'text-xs'
          )}
        >
          {taskId}
        </span>
      )}

      {/* Priority indicator */}
      {priorityInfo && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-0.5 cursor-default',
                priorityInfo.className
              )}
            >
              <priorityInfo.icon
                weight="fill"
                className={compact ? 'size-3' : 'size-3.5'}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <span>Priority: {priorityInfo.label}</span>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Due date */}
      {dueDateInfo && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-0.5 cursor-default',
                compact ? 'text-[10px]' : 'text-xs',
                dueDateInfo.isOverdue && 'text-red-500',
                dueDateInfo.isToday && 'text-orange-500',
                !dueDateInfo.isOverdue &&
                  !dueDateInfo.isToday &&
                  'text-muted-foreground'
              )}
            >
              <CalendarBlank className={compact ? 'size-3' : 'size-3.5'} />
              <span>{dueDateInfo.text}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <span>
              Due:{' '}
              {new Date(dueDate!).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Labels */}
      {labels && labels.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {labels.slice(0, compact ? 2 : 3).map((label, index) => (
            <Tooltip key={`${label.name}-${index}`}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5',
                    compact ? 'text-[9px]' : 'text-[10px]',
                    'font-medium cursor-default'
                  )}
                  style={{
                    backgroundColor: `${label.color}20`,
                    color: label.color,
                  }}
                >
                  <Circle
                    weight="fill"
                    className="size-1.5"
                    style={{ color: label.color }}
                  />
                  {label.name}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <span>Label: {label.name}</span>
              </TooltipContent>
            </Tooltip>
          ))}
          {labels.length > (compact ? 2 : 3) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'text-muted-foreground cursor-default',
                    compact ? 'text-[9px]' : 'text-[10px]'
                  )}
                >
                  +{labels.length - (compact ? 2 : 3)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Additional labels:</span>
                  {labels.slice(compact ? 2 : 3).map((label, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <Circle
                        weight="fill"
                        className="size-1.5"
                        style={{ color: label.color }}
                      />
                      {label.name}
                    </span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskIdBadge({
  prefix,
  number,
  className,
}: {
  prefix?: string | null;
  number?: bigint | null;
  className?: string;
}) {
  if (!prefix || !number) return null;

  return (
    <span className={cn('font-mono text-xs text-muted-foreground', className)}>
      {prefix}-{number.toString()}
    </span>
  );
}

export function PriorityIndicator({
  priority,
  showLabel = false,
  className,
}: {
  priority: TaskPriority;
  showLabel?: boolean;
  className?: string;
}) {
  if (priority === 'none') return null;

  const config = priorityConfig[priority];

  return (
    <div
      className={cn('flex items-center gap-1', config.className, className)}
      title={`Priority: ${config.label}`}
    >
      <config.icon weight="fill" className="size-3.5" />
      {showLabel && <span className="text-xs">{config.label}</span>}
    </div>
  );
}
