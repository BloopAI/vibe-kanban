import { useDraggable } from '@dnd-kit/core';
import {
  SpinnerIcon,
  XCircleIcon,
  DotsThreeIcon,
  GitPullRequestIcon,
  GitMergeIcon,
  CheckCircleIcon,
  XCircleIcon as XCircleCiIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type {
  TaskWithAttemptStatus,
  MergeStatus,
  CiStatus,
} from 'shared/types';
import { TaskMetadata } from '@/components/tasks/TaskMetadata';
import { useProject } from '@/contexts/ProjectContext';
import {
  inferTaskCategory,
  getCategoryConfig,
  type TaskCategory,
} from '@/utils/categoryLabels';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Returns the appropriate icon and color for a PR status
 */
function getPrStatusIndicator(prStatus: MergeStatus | null) {
  if (!prStatus) return null;

  switch (prStatus) {
    case 'merged':
      return {
        icon: GitMergeIcon,
        color: 'text-success',
        title: 'PR merged',
      };
    case 'open':
      return {
        icon: GitPullRequestIcon,
        color: 'text-info',
        title: 'PR open',
      };
    case 'closed':
      return {
        icon: GitPullRequestIcon,
        color: 'text-error',
        title: 'PR closed',
      };
    default:
      return {
        icon: GitPullRequestIcon,
        color: 'text-low',
        title: 'PR status unknown',
      };
  }
}

/**
 * Returns the category indicator with icon and styling
 */
function getCategoryIndicator(category: TaskCategory | null) {
  if (!category) return null;
  const config = getCategoryConfig(category);
  return {
    icon: config.icon,
    label: config.label,
    color: config.color,
  };
}

/**
 * Returns the appropriate icon and color for a CI status
 */
function getCiStatusIndicator(
  ciStatus: CiStatus | null,
  prStatus: MergeStatus | null
) {
  // Only show CI status for open PRs
  if (!ciStatus || prStatus !== 'open') return null;

  switch (ciStatus) {
    case 'passing':
      return {
        icon: CheckCircleIcon,
        color: 'text-success',
        title: 'CI passing',
      };
    case 'failing':
      return {
        icon: XCircleCiIcon,
        color: 'text-error',
        title: 'CI failing',
      };
    case 'pending':
      return {
        icon: CircleNotchIcon,
        color: 'text-warning',
        title: 'CI running',
        animate: true,
      };
    default:
      // Don't show indicator for unknown status
      return null;
  }
}

interface SwimlaneTaskCardProps {
  task: TaskWithAttemptStatus;
  projectId: string;
  onClick: () => void;
  isSelected?: boolean;
}

export function SwimlaneTaskCard({
  task,
  projectId,
  onClick,
  isSelected,
}: SwimlaneTaskCardProps) {
  const { project } = useProject();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: {
        type: 'task',
        task,
        projectId,
      },
    });

  // Generate task ID from project prefix and task number
  const taskId =
    project?.task_prefix && task.task_number
      ? `${project.task_prefix}-${task.task_number}`
      : undefined;

  // Infer category from task title and description
  const category = inferTaskCategory(task.title, task.description);
  const categoryIndicator = getCategoryIndicator(category);

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    // Apply category border color if category is detected
    ...(categoryIndicator && {
      borderLeftColor: categoryIndicator.color,
    }),
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'group/card w-full text-left px-2.5 py-2 rounded-md',
        'transition-all duration-150 ease-out',
        'cursor-grab active:cursor-grabbing',
        'border border-transparent',
        // Category left border
        categoryIndicator && 'border-l-2',
        // Default state
        !isSelected &&
          !isDragging && [
            'bg-secondary/60',
            'hover:bg-secondary/90 hover:border-panel/40',
            'hover:shadow-sm hover:shadow-black/[0.03]',
            // Preserve left border color on hover
            categoryIndicator && 'hover:border-l-2',
          ],
        // Selected state
        isSelected &&
          !isDragging && [
            'bg-panel/80 border-brand/40',
            'ring-2 ring-brand/20',
            'shadow-sm shadow-brand/5',
            // Preserve left border color when selected
            categoryIndicator && 'border-l-2',
          ],
        // Dragging state
        isDragging && [
          'bg-panel border-brand/30',
          'shadow-lg shadow-black/15',
          'scale-[1.02] rotate-[0.5deg]',
          'opacity-95',
          'z-50',
          // Preserve left border color when dragging
          categoryIndicator && 'border-l-2',
        ],
        // Focus state for keyboard navigation
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1'
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-1.5">
          {/* Category icon badge */}
          {categoryIndicator && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 text-[11px] leading-none mt-0.5 cursor-default">
                  {categoryIndicator.icon}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <span>Category: {categoryIndicator.label}</span>
              </TooltipContent>
            </Tooltip>
          )}
          <span
            className={cn(
              'flex-1 text-xs leading-snug font-medium',
              'text-normal',
              'transition-colors duration-150',
              isSelected && 'text-high',
              'group-hover/card:text-high'
            )}
          >
            {task.title}
          </span>
          <div className="flex items-center gap-1 shrink-0 mt-px">
            {/* CI status indicator (only for open PRs) */}
            {(() => {
              const ciIndicator = getCiStatusIndicator(
                task.ci_status,
                task.pr_status
              );
              if (!ciIndicator) return null;
              const CiIcon = ciIndicator.icon;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default">
                      <CiIcon
                        weight="fill"
                        className={cn(
                          'size-3',
                          ciIndicator.color,
                          ciIndicator.animate && 'animate-spin'
                        )}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <span>{ciIndicator.title}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })()}
            {/* PR status indicator */}
            {(() => {
              const prIndicator = getPrStatusIndicator(task.pr_status);
              if (!prIndicator) return null;
              const PrIcon = prIndicator.icon;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default">
                      <PrIcon
                        weight="fill"
                        className={cn('size-3', prIndicator.color)}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <span>{prIndicator.title}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })()}
            {task.has_in_progress_attempt && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-default">
                    <SpinnerIcon className="size-3 animate-spin text-info" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <span>Task in progress</span>
                </TooltipContent>
              </Tooltip>
            )}
            {task.last_attempt_failed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-default">
                    <XCircleIcon weight="fill" className="size-3 text-error" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <span>Last attempt failed</span>
                </TooltipContent>
              </Tooltip>
            )}
            <DotsThreeIcon
              weight="bold"
              className={cn(
                'size-3.5 text-low/60',
                'opacity-0 group-hover/card:opacity-100',
                'transition-all duration-150',
                'hover:text-normal'
              )}
            />
          </div>
        </div>
        {task.description && (
          <p
            className={cn(
              'text-[10px] leading-relaxed',
              'text-low/50 line-clamp-2',
              'group-hover/card:text-low/70',
              'transition-colors duration-150'
            )}
          >
            {task.description}
          </p>
        )}
        <TaskMetadata
          taskId={taskId}
          priority={task.priority}
          dueDate={task.due_date}
          labels={task.labels}
          compact
          className="mt-1"
        />
      </div>
    </button>
  );
}
