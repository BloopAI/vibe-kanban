import { memo, useCallback } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { TableRow, TableCell } from '@/components/ui/table/table';
import { StatusBadge } from './StatusBadge';
import { UserAvatar } from './UserAvatar';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import type { ParsedTaskProperties } from '@/hooks/useTaskProperties';

interface TaskTableRowProps {
  task: TaskWithAttemptStatus;
  sharedTask?: SharedTaskRecord;
  taskProps?: ParsedTaskProperties[string];
  onViewDetails: (task: TaskWithAttemptStatus) => void;
  isSelected?: boolean;
}

function TaskTableRowComponent({
  task,
  sharedTask,
  taskProps,
  onViewDetails,
  isSelected,
}: TaskTableRowProps) {
  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onViewDetails(task);
      }
    },
    [task, onViewDetails]
  );

  const isShared = Boolean(sharedTask || task.shared_task_id);

  return (
    <TableRow
      clickable
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group transition-colors duration-150',
        'hover:bg-primary/5 dark:hover:bg-primary/10',
        isSelected && 'bg-primary/10 dark:bg-primary/15',
        isShared && 'relative'
      )}
    >
      {/* Title */}
      <TableCell className="py-4 px-5 max-w-[300px]">
        <div className="flex items-center gap-2">
          {isShared && (
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary/60 rounded-r" />
          )}
          <span className="truncate font-medium text-foreground" title={task.title}>
            {task.title}
          </span>
        </div>
      </TableCell>

      {/* Status - show GitHub status if available, otherwise Vibe status */}
      <TableCell className="py-4 px-5">
        {taskProps?.githubStatus ? (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
            {taskProps.githubStatus}
          </span>
        ) : (
          <StatusBadge status={task.status} />
        )}
      </TableCell>

      {/* Priority - hidden on small screens */}
      <TableCell className="py-4 px-5 hidden sm:table-cell">
        {taskProps?.githubPriority && (
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
              // P0-P3 priority labels
              (taskProps.githubPriority === 'P0' ||
                taskProps.githubPriority.toLowerCase() === 'critical') &&
                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              (taskProps.githubPriority === 'P1' ||
                taskProps.githubPriority.toLowerCase() === 'high') &&
                'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
              (taskProps.githubPriority === 'P2' ||
                taskProps.githubPriority.toLowerCase() === 'medium') &&
                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
              (taskProps.githubPriority === 'P3' ||
                taskProps.githubPriority.toLowerCase() === 'low') &&
                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
              // Default for unknown priorities
              !['P0', 'P1', 'P2', 'P3', 'critical', 'high', 'medium', 'low'].includes(
                taskProps.githubPriority.toLowerCase()
              ) && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
            )}
          >
            {taskProps.githubPriority}
          </span>
        )}
      </TableCell>

      {/* Genre - hidden on large screens */}
      <TableCell className="py-4 px-5 hidden lg:table-cell">
        {taskProps?.['ジャンル'] != null && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
            {taskProps['ジャンル'] as string}
          </span>
        )}
      </TableCell>

      {/* Assignee - hidden on medium screens */}
      <TableCell className="py-4 px-5 hidden md:table-cell">
        {taskProps?.githubAssignees && taskProps.githubAssignees.length > 0 ? (
          <div className="flex items-center gap-1">
            {taskProps.githubAssignees.slice(0, 2).map((assignee) => (
              <span
                key={assignee}
                className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/20 text-primary text-xs font-medium"
                title={assignee}
              >
                {assignee.slice(0, 2).toUpperCase()}
              </span>
            ))}
            {taskProps.githubAssignees.length > 2 && (
              <span className="text-xs text-muted-foreground">
                +{taskProps.githubAssignees.length - 2}
              </span>
            )}
          </div>
        ) : sharedTask ? (
          <UserAvatar
            firstName={sharedTask.assignee_first_name}
            lastName={sharedTask.assignee_last_name}
            username={sharedTask.assignee_username}
            className="h-6 w-6"
          />
        ) : null}
      </TableCell>

      {/* Progress indicators */}
      <TableCell className="py-4 px-5">
        <div className="flex items-center gap-1.5">
          {task.has_in_progress_attempt && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {task.last_attempt_failed && (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
      </TableCell>

      {/* Actions */}
      <TableCell className="py-4 px-5">
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <ActionsDropdown task={task} sharedTask={sharedTask} />
        </div>
      </TableCell>
    </TableRow>
  );
}

export const TaskTableRow = memo(TaskTableRowComponent);
