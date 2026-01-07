import { useCallback, useEffect, useRef } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { TaskCardHeader } from './TaskCardHeader';

interface SharedTaskCardProps {
  task: SharedTaskRecord;
  index: number;
  status: string;
  onViewDetails?: (task: SharedTaskRecord) => void;
  isSelected?: boolean;
}

export function SharedTaskCard({
  task,
  index,
  status,
  onViewDetails,
  isSelected,
}: SharedTaskCardProps) {
  const localRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(() => {
    onViewDetails?.(task);
  }, [onViewDetails, task]);

  useEffect(() => {
    if (!isSelected || !localRef.current) return;
    const el = localRef.current;
    requestAnimationFrame(() => {
      el.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    });
  }, [isSelected]);

  return (
    <KanbanCard
      id={`shared-${task.id}`}
      name={task.title}
      index={index}
      parent={status}
      onClick={handleClick}
      isOpen={isSelected}
      forwardedRef={localRef}
      dragDisabled
      className="relative overflow-hidden pl-5 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-muted-foreground before:content-['']"
    >
      <div className="flex flex-col gap-2">
        <TaskCardHeader
          title={task.title}
          avatar={{
            firstName: task.assignee_first_name ?? undefined,
            lastName: task.assignee_last_name ?? undefined,
            username: task.assignee_username ?? undefined,
          }}
        />
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
