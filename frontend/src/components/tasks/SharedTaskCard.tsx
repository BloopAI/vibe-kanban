import { useCallback, useEffect, useRef } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { UserAvatar } from './UserAvatar';

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
      <div className="flex items-center gap-3">
        <UserAvatar
          firstName={task.assignee_first_name ?? undefined}
          lastName={task.assignee_last_name ?? undefined}
          username={task.assignee_username ?? undefined}
          // TODO: Add imageUrl={task.assignee_avatar_url} when backend provides it
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1 font-light">
          <h4 className="text-sm text-muted-foreground line-clamp-2">
            {task.title}
          </h4>
          {task.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}
        </div>
      </div>
    </KanbanCard>
  );
}
