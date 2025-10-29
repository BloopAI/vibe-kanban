import { useCallback, useEffect, useRef } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '@/components/ui/ActionsDropdown';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { UserAvatar } from './UserAvatar';

type Task = TaskWithAttemptStatus;

interface TaskCardProps {
  task: Task;
  index: number;
  status: string;
  onViewDetails: (task: Task) => void;
  isOpen?: boolean;
  sharedTask?: SharedTaskRecord;
}

export function TaskCard({
  task,
  index,
  status,
  onViewDetails,
  isOpen,
  sharedTask,
}: TaskCardProps) {
  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !localRef.current) return;
    const el = localRef.current;
    requestAnimationFrame(() => {
      el.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    });
  }, [isOpen]);

  return (
    <KanbanCard
      key={task.id}
      id={task.id}
      name={task.title}
      index={index}
      parent={status}
      onClick={handleClick}
      isOpen={isOpen}
      forwardedRef={localRef}
      className={
        sharedTask
          ? 'relative overflow-hidden pl-5 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-card-foreground before:content-[""]'
          : undefined
      }
    >
      <div className="flex gap-3">
        {sharedTask ? (
          <UserAvatar
            firstName={sharedTask.assignee_first_name ?? undefined}
            lastName={sharedTask.assignee_last_name ?? undefined}
            username={sharedTask.assignee_username ?? undefined}
            className="self-center"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="flex-1 min-w-0 line-clamp-2 font-light text-sm">
              {task.title}
            </h4>
            <div className="flex items-center gap-2">
              {/* In Progress Spinner */}
              {task.has_in_progress_attempt && (
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              )}
              {/* Merged Indicator */}
              {task.has_merged_attempt && (
                <CheckCircle className="h-3 w-3 text-green-500" />
              )}
              {/* Failed Indicator */}
              {task.last_attempt_failed && !task.has_merged_attempt && (
                <XCircle className="h-3 w-3 text-destructive" />
              )}
              {/* Actions Menu */}
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <ActionsDropdown task={task} sharedTask={sharedTask} />
              </div>
            </div>
          </div>
          {task.description && (
            <p className="text-sm text-secondary-foreground break-words">
              {task.description.length > 130
                ? `${task.description.substring(0, 130)}...`
                : task.description}
            </p>
          )}
        </div>
      </div>
    </KanbanCard>
  );
}
