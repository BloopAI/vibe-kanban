import { cn } from '@/lib/utils';
import type { TaskLabel, TaskPriority } from 'shared/types';
import {
  CalendarBlank,
  Flag,
  Circle,
} from '@phosphor-icons/react';

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

function formatDueDate(dateStr: string): { text: string; isOverdue: boolean; isToday: boolean } {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true, isToday: false };
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

  const priorityInfo = priority && priority !== 'none' ? priorityConfig[priority] : null;
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
        <div
          className={cn(
            'flex items-center gap-0.5',
            priorityInfo.className
          )}
          title={`Priority: ${priorityInfo.label}`}
        >
          <priorityInfo.icon
            weight="fill"
            className={compact ? 'size-3' : 'size-3.5'}
          />
        </div>
      )}

      {/* Due date */}
      {dueDateInfo && (
        <div
          className={cn(
            'flex items-center gap-0.5',
            compact ? 'text-[10px]' : 'text-xs',
            dueDateInfo.isOverdue && 'text-red-500',
            dueDateInfo.isToday && 'text-orange-500',
            !dueDateInfo.isOverdue && !dueDateInfo.isToday && 'text-muted-foreground'
          )}
          title={`Due: ${dueDate}`}
        >
          <CalendarBlank className={compact ? 'size-3' : 'size-3.5'} />
          <span>{dueDateInfo.text}</span>
        </div>
      )}

      {/* Labels */}
      {labels && labels.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {labels.slice(0, compact ? 2 : 3).map((label, index) => (
            <span
              key={`${label.name}-${index}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5',
                compact ? 'text-[9px]' : 'text-[10px]',
                'font-medium'
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
          ))}
          {labels.length > (compact ? 2 : 3) && (
            <span
              className={cn(
                'text-muted-foreground',
                compact ? 'text-[9px]' : 'text-[10px]'
              )}
            >
              +{labels.length - (compact ? 2 : 3)}
            </span>
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
    <span
      className={cn(
        'font-mono text-xs text-muted-foreground',
        className
      )}
    >
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
