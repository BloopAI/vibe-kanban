import { useDraggable } from '@dnd-kit/core';
import { SpinnerIcon, XCircleIcon, DotsThreeIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus } from 'shared/types';

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
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: {
        type: 'task',
        task,
        projectId,
      },
    });

  const style = {
    transform: transform
      ? `translateX(${transform.x}px) translateY(${transform.y}px)`
      : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
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
        'group/card w-full text-left p-half rounded transition-all cursor-grab active:cursor-grabbing',
        'hover:ring-1 hover:ring-panel',
        isDragging && 'shadow-lg scale-[1.02] opacity-90',
        isSelected
          ? 'bg-panel ring-1 ring-brand'
          : 'bg-[hsl(0_0%_18%)]'
      )}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-start gap-half">
          <span className="flex-1 text-xs text-normal leading-snug font-medium">
            {task.title}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            {task.has_in_progress_attempt && (
              <SpinnerIcon className="size-icon-xs animate-spin text-info" />
            )}
            {task.last_attempt_failed && (
              <XCircleIcon className="size-icon-xs text-error" />
            )}
            <DotsThreeIcon
              weight="bold"
              className="size-icon-xs text-low opacity-0 group-hover/card:opacity-100 transition-opacity"
            />
          </div>
        </div>
        {task.description && (
          <p className="text-xs text-low/70 leading-snug line-clamp-2">
            {task.description}
          </p>
        )}
      </div>
    </button>
  );
}
