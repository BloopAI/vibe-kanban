import { useCallback, useEffect, useRef, useState } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import { CheckCircle, Link, Loader2, XCircle } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '@/components/ui/ActionsDropdown';
import { Button } from '@/components/ui/button';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';
import { attemptsApi } from '@/lib/api';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { UserAvatar } from './UserAvatar';
import { useTranslation } from 'react-i18next';

type Task = TaskWithAttemptStatus;

interface TaskCardProps {
  task: Task;
  index: number;
  status: string;
  onViewDetails: (task: Task) => void;
  isOpen?: boolean;
  projectId: string;
  sharedTask?: SharedTaskRecord;
}

export function TaskCard({
  task,
  index,
  status,
  onViewDetails,
  isOpen,
  projectId,
  sharedTask,
}: TaskCardProps) {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const [isNavigatingToParent, setIsNavigatingToParent] = useState(false);

  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  const handleParentClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!task.parent_task_attempt || isNavigatingToParent) return;

      setIsNavigatingToParent(true);
      try {
        const parentAttempt = await attemptsApi.get(task.parent_task_attempt);
        navigate(
          paths.attempt(
            projectId,
            parentAttempt.task_id,
            task.parent_task_attempt
          )
        );
      } catch (error) {
        console.error('Failed to navigate to parent task attempt:', error);
        setIsNavigatingToParent(false);
      }
    },
    [task.parent_task_attempt, projectId, navigate, isNavigatingToParent]
  );

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
            // TODO: Add imageUrl={sharedTask.assignee_avatar_url} when backend provides it
            className="self-center"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-1 min-w-0 items-center gap-2">
            <h4 className="flex-1 min-w-0 line-clamp-2 font-light text-sm">
              {task.title}
            </h4>
            <div className="flex items-center gap-1">
              {/* In Progress Spinner */}
              {task.has_in_progress_attempt && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              )}
              {/* Merged Indicator */}
              {task.has_merged_attempt && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              {/* Failed Indicator */}
              {task.last_attempt_failed && !task.has_merged_attempt && (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              {/* Parent Task Indicator */}
              {task.parent_task_attempt && (
                <Button
                  variant="icon"
                  onClick={handleParentClick}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={isNavigatingToParent}
                  title={t('navigateToParent')}
                >
                  <Link className="h-4 w-4" />
                </Button>
              )}
              {/* Actions Menu */}
              <ActionsDropdown task={task} sharedTask={sharedTask} />
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
