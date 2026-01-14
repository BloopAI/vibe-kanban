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
import type { TaskWithAttemptStatus, MergeStatus, CiStatus } from 'shared/types';
import { TaskMetadata } from '@/components/tasks/TaskMetadata';
import { useProject } from '@/contexts/ProjectContext';

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
 * Returns the appropriate icon and color for a CI status
 */
function getCiStatusIndicator(ciStatus: CiStatus | null, prStatus: MergeStatus | null) {
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

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
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
        'group/card w-full text-left px-2 py-1.5 rounded-sm',
        'transition-all duration-150 ease-out',
        'cursor-grab active:cursor-grabbing',
        'border border-transparent',
        // Default state
        !isSelected && !isDragging && [
          'bg-secondary/80',
          'hover:bg-secondary hover:border-panel/50',
        ],
        // Selected state
        isSelected && !isDragging && [
          'bg-panel border-brand/50',
          'ring-1 ring-brand/30',
        ],
        // Dragging state
        isDragging && [
          'bg-panel border-brand/30',
          'shadow-xl shadow-black/20',
          'scale-[1.02] rotate-[0.5deg]',
          'opacity-95',
          'z-50',
        ]
      )}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-start gap-1">
          <span className={cn(
            'flex-1 text-xs leading-snug font-medium',
            'text-normal/90',
            isSelected && 'text-high'
          )}>
            {task.title}
          </span>
          <div className="flex items-center gap-0.5 shrink-0 mt-px">
            {/* CI status indicator (only for open PRs) */}
            {(() => {
              const ciIndicator = getCiStatusIndicator(task.ci_status, task.pr_status);
              if (!ciIndicator) return null;
              const CiIcon = ciIndicator.icon;
              return (
                <span title={ciIndicator.title}>
                  <CiIcon
                    weight="fill"
                    className={cn(
                      'size-3',
                      ciIndicator.color,
                      ciIndicator.animate && 'animate-spin'
                    )}
                  />
                </span>
              );
            })()}
            {/* PR status indicator */}
            {(() => {
              const prIndicator = getPrStatusIndicator(task.pr_status);
              if (!prIndicator) return null;
              const PrIcon = prIndicator.icon;
              return (
                <span title={prIndicator.title}>
                  <PrIcon
                    weight="fill"
                    className={cn('size-3', prIndicator.color)}
                  />
                </span>
              );
            })()}
            {task.has_in_progress_attempt && (
              <SpinnerIcon className="size-3 animate-spin text-info" />
            )}
            {task.last_attempt_failed && (
              <XCircleIcon weight="fill" className="size-3 text-error" />
            )}
            <DotsThreeIcon
              weight="bold"
              className={cn(
                'size-3 text-low',
                'opacity-0 group-hover/card:opacity-100',
                'transition-opacity duration-100'
              )}
            />
          </div>
        </div>
        {task.description && (
          <p className={cn(
            'text-[10px] leading-snug',
            'text-low/60 line-clamp-2',
            'group-hover/card:text-low/80',
            'transition-colors duration-100'
          )}>
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
