import { memo, useCallback, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import { StatusIcon } from '@/utils/statusIcons';
import { PriorityBadge } from '@/utils/priorityUtils';

interface LinearIssueCardProps {
  task: TaskWithAttemptStatus;
  index: number;
  status: TaskStatus;
  issueKey?: string; // e.g., "VIB-1"
  projectName?: string;
  onViewDetails: (task: TaskWithAttemptStatus) => void;
  isSelected?: boolean;
}

function LinearIssueCardComponent({
  task,
  index,
  status,
  issueKey,
  projectName,
  onViewDetails,
  isSelected,
}: LinearIssueCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { index, parent: status },
  });

  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [setNodeRef]
  );

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isSelected]);

  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  return (
    <Card
      ref={combinedRef}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={cn(
        'p-3 cursor-pointer transition-all duration-150',
        'bg-card hover:bg-accent/30 border border-border/50',
        'rounded-lg shadow-sm',
        isDragging && 'opacity-50 cursor-grabbing shadow-lg',
        isSelected && 'ring-2 ring-primary ring-offset-1'
      )}
      style={{
        zIndex: isDragging ? 1000 : 1,
        transform: transform
          ? `translateX(${transform.x}px) translateY(${transform.y}px)`
          : 'none',
      }}
    >
      <div className="flex flex-col gap-2">
        {/* Top row: Issue ID and Assignee */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            {issueKey || task.id.slice(0, 8).toUpperCase()}
          </span>
          <button
            className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Open assignee dropdown
            }}
          >
            <Users className="h-4 w-4" />
          </button>
        </div>

        {/* Title row with status icon */}
        <div className="flex items-start gap-2">
          <StatusIcon status={status} className="mt-0.5 shrink-0" />
          <h4 className="text-sm font-medium leading-snug line-clamp-2">
            {task.title}
          </h4>
        </div>

        {/* Bottom row: Priority and Project tag */}
        <div className="flex items-center gap-2 mt-1">
          <PriorityBadge priority={task.priority} />
          {projectName && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs text-muted-foreground bg-muted/30">
              <svg
                className="h-3 w-3"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M8 0L14.928 4v8L8 16 1.072 12V4L8 0z" fillOpacity="0.3" />
                <path d="M8 2l5.196 3v6L8 14 2.804 11V5L8 2z" />
              </svg>
              {projectName}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export const LinearIssueCard = memo(LinearIssueCardComponent);
