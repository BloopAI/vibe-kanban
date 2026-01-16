import { memo, useCallback } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { TableRow, TableCell } from '@/components/ui/table/table';
import { StatusBadge } from './StatusBadge';
import { UserAvatar } from './UserAvatar';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import { formatRelativeTime } from '@/utils/date';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';

interface TaskTableRowProps {
  task: TaskWithAttemptStatus;
  sharedTask?: SharedTaskRecord;
  onViewDetails: (task: TaskWithAttemptStatus) => void;
  isSelected?: boolean;
}

function TaskTableRowComponent({
  task,
  sharedTask,
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
        'group',
        isSelected && 'bg-accent',
        isShared && 'relative'
      )}
    >
      {/* Title */}
      <TableCell className="max-w-[300px]">
        <div className="flex items-center gap-2">
          {isShared && (
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-card-foreground" />
          )}
          <span className="truncate font-medium" title={task.title}>
            {task.title}
          </span>
        </div>
      </TableCell>

      {/* Status */}
      <TableCell>
        <StatusBadge status={task.status} />
      </TableCell>

      {/* Assignee - hidden on small screens */}
      <TableCell className="hidden sm:table-cell">
        {sharedTask && (
          <UserAvatar
            firstName={sharedTask.assignee_first_name}
            lastName={sharedTask.assignee_last_name}
            username={sharedTask.assignee_username}
            className="h-5 w-5"
          />
        )}
      </TableCell>

      {/* Progress indicators */}
      <TableCell>
        <div className="flex items-center gap-1">
          {task.has_in_progress_attempt && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          {task.last_attempt_failed && (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
      </TableCell>

      {/* Created at - hidden on medium screens */}
      <TableCell className="text-muted-foreground whitespace-nowrap hidden md:table-cell">
        {formatRelativeTime(task.created_at)}
      </TableCell>

      {/* Actions */}
      <TableCell>
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <ActionsDropdown task={task} sharedTask={sharedTask} />
        </div>
      </TableCell>
    </TableRow>
  );
}

export const TaskTableRow = memo(TaskTableRowComponent);
