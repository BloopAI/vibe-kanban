import { useCallback, useEffect, useRef } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { TaskCardHeader } from './TaskCardHeader';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface SharedTaskCardProps {
  task: SharedTaskRecord;
  index: number;
  status: string;
  onViewDetails?: (task: SharedTaskRecord) => void;
  isSelected?: boolean;
  isCollapsed?: boolean;
  onToggleCollapsed?: (taskId: string) => void;
}

export function SharedTaskCard({
  task,
  index,
  status,
  onViewDetails,
  isSelected,
  isCollapsed = false,
  onToggleCollapsed,
}: SharedTaskCardProps) {
  const { t } = useTranslation('tasks');
  const localRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(() => {
    onViewDetails?.(task);
  }, [onViewDetails, task]);

  const handleToggleCollapsed = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleCollapsed?.(task.id);
    },
    [task.id, onToggleCollapsed]
  );

  const hasExpandableContent = !!task.description;

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
          title={
            <span className="flex items-center gap-1">
              {hasExpandableContent && onToggleCollapsed && (
                <Button
                  variant="icon"
                  onClick={handleToggleCollapsed}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-4 w-4 p-0 -ml-1 shrink-0"
                  title={isCollapsed ? t('expand') : t('collapse')}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              )}
              <span>{task.title}</span>
            </span>
          }
          avatar={{
            firstName: task.assignee_first_name ?? undefined,
            lastName: task.assignee_last_name ?? undefined,
            username: task.assignee_username ?? undefined,
          }}
        />
        {!isCollapsed && task.description && (
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
