import { useCallback, useEffect, useRef, useState } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import {
  Link,
  Link2,
  Loader2,
  XCircle,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  Ban,
} from 'lucide-react';
import type { TaskWithAttemptStatus, Label, TaskPriority } from 'shared/types';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import { Button } from '@/components/ui/button';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';
import { attemptsApi } from '@/lib/api';
import { TaskCardHeader } from './TaskCardHeader';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTaskLabels, useTaskDependencies } from '@/hooks/useLabels';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type Task = TaskWithAttemptStatus;

const priorityConfig: Record<
  TaskPriority,
  { icon: React.ElementType; color: string; label: string }
> = {
  urgent: {
    icon: AlertTriangle,
    color: 'text-red-500',
    label: 'Urgent',
  },
  high: {
    icon: ArrowUp,
    color: 'text-orange-500',
    label: 'High',
  },
  medium: {
    icon: Minus,
    color: 'text-blue-500',
    label: 'Medium',
  },
  low: {
    icon: ArrowDown,
    color: 'text-gray-400',
    label: 'Low',
  },
};

function PriorityIndicator({ priority }: { priority: TaskPriority }) {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  // Don't show indicator for medium priority (default)
  if (priority === 'medium') return null;

  return (
    <div className={cn('flex items-center', config.color)} title={config.label}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function LabelBadges({ labels }: { labels: Label[] }) {
  if (!labels || labels.length === 0) return null;

  // Show max 3 labels, with a +N indicator for more
  const visibleLabels = labels.slice(0, 3);
  const remainingCount = labels.length - 3;

  return (
    <div className="flex flex-wrap gap-1">
      {visibleLabels.map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
          style={{
            backgroundColor: `${label.color}20`,
            color: label.color,
            border: `1px solid ${label.color}40`,
          }}
        >
          {label.name}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
          +{remainingCount}
        </span>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  index: number;
  status: string;
  onViewDetails: (task: Task) => void;
  isOpen?: boolean;
  projectId: string;
  allTasks?: Task[];
}

export function TaskCard({
  task,
  index,
  status,
  onViewDetails,
  isOpen,
  projectId,
  allTasks = [],
}: TaskCardProps) {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const [isNavigatingToParent, setIsNavigatingToParent] = useState(false);
  const { data: labels = [] } = useTaskLabels(task.id);
  const { data: dependencies = [] } = useTaskDependencies(task.id);

  // Check if task is blocked (has incomplete dependencies)
  const incompleteDependencies = dependencies.filter((depId) => {
    const depTask = allTasks.find((t) => t.id === depId);
    return depTask && depTask.status !== 'done';
  });
  const isBlocked = incompleteDependencies.length > 0;
  const hasDependencies = dependencies.length > 0;

  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  const handleParentClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!task.parent_workspace_id || isNavigatingToParent) return;

      setIsNavigatingToParent(true);
      try {
        const parentAttempt = await attemptsApi.get(task.parent_workspace_id);
        navigate(
          paths.attempt(
            projectId,
            parentAttempt.task_id,
            task.parent_workspace_id
          )
        );
      } catch (error) {
        console.error('Failed to navigate to parent task attempt:', error);
        setIsNavigatingToParent(false);
      }
    },
    [task.parent_workspace_id, projectId, navigate, isNavigatingToParent]
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
    >
      <div className="flex flex-col gap-2">
        <TaskCardHeader
          title={task.title}
          right={
            <>
              {/* Blocked indicator */}
              {isBlocked && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center text-amber-500">
                        <Ban className="h-3.5 w-3.5" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {t('taskCard.blocked', 'Blocked by')}{' '}
                        {incompleteDependencies.length}{' '}
                        {incompleteDependencies.length === 1
                          ? t('taskCard.task', 'task')
                          : t('taskCard.tasks', 'tasks')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Dependencies indicator (not blocked) */}
              {hasDependencies && !isBlocked && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center text-green-500">
                        <Link2 className="h-3.5 w-3.5" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {t(
                          'taskCard.dependenciesComplete',
                          'All dependencies complete'
                        )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <PriorityIndicator priority={task.priority} />
              {task.has_in_progress_attempt && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              )}
              {task.last_attempt_failed && (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              {task.parent_workspace_id && (
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
              <ActionsDropdown task={task} />
            </>
          }
        />
        {/* Labels */}
        <LabelBadges labels={labels} />
        {task.description && (
          <p className="text-sm text-secondary-foreground break-words">
            {task.description.length > 130
              ? `${task.description.substring(0, 130)}...`
              : task.description}
          </p>
        )}
      </div>
    </KanbanCard>
  );
}
