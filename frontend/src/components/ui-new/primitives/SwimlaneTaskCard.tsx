import { useDraggable } from '@dnd-kit/core';
import { SpinnerIcon, XCircleIcon } from '@phosphor-icons/react';
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
        'w-full text-left px-half py-1 rounded border transition-all cursor-grab active:cursor-grabbing',
        'hover:bg-panel/80 hover:border-panel',
        isDragging && 'shadow-md scale-[1.02] bg-primary',
        isSelected
          ? 'bg-panel border-brand ring-1 ring-inset ring-brand'
          : 'bg-secondary border-transparent'
      )}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-half">
          <span className="flex-1 text-xs text-normal truncate leading-snug font-medium">
            {task.title}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {task.has_in_progress_attempt && (
              <SpinnerIcon className="size-icon-xs animate-spin text-info" />
            )}
            {task.last_attempt_failed && (
              <XCircleIcon className="size-icon-xs text-error" />
            )}
          </div>
        </div>
        {task.description && (
          <p className="text-xs text-low leading-snug line-clamp-1">
            {task.description.length > 60
              ? `${task.description.substring(0, 60)}...`
              : task.description}
          </p>
        )}
      </div>
    </button>
  );
}
