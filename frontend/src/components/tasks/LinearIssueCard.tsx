import { memo, useCallback, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import { StatusIcon } from '@/utils/statusIcons';
import {
  AssigneeSelector,
  PrioritySelector,
  ComponentSelector,
  type TeamMember,
  type PriorityValue,
  type ComponentValue,
} from '@/components/selectors';

interface LinearIssueCardProps {
  task: TaskWithAttemptStatus;
  index: number;
  status: TaskStatus;
  issueKey?: string; // e.g., "VIB-1"
  projectName?: string;
  component?: string | null; // e.g., "frontend", "backend"
  onViewDetails: (task: TaskWithAttemptStatus) => void;
  isSelected?: boolean;
  teamMembers?: TeamMember[];
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onComponentChange?: (taskId: string, component: string | null) => void;
}

function LinearIssueCardComponent({
  task,
  index,
  status,
  issueKey,
  projectName,
  component,
  onViewDetails,
  isSelected,
  teamMembers = [],
  onAssigneeChange,
  onPriorityChange,
  onComponentChange,
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

  const handleAssigneeChange = useCallback((assigneeId: string | null) => {
    onAssigneeChange?.(task.id, assigneeId);
  }, [task.id, onAssigneeChange]);

  const handlePriorityChange = useCallback((priority: PriorityValue) => {
    onPriorityChange?.(task.id, priority);
  }, [task.id, onPriorityChange]);

  const handleComponentChange = useCallback((newComponent: ComponentValue) => {
    onComponentChange?.(task.id, newComponent);
  }, [task.id, onComponentChange]);

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
          <span className="text-xs text-muted-foreground font-mono font-medium">
            {issueKey || task.id.slice(0, 8).toUpperCase()}
          </span>

          {/* Assignee Selector */}
          <div onClick={(e) => e.stopPropagation()}>
            <AssigneeSelector
              value={task.assignee_id}
              onChange={handleAssigneeChange}
              teamMembers={teamMembers}
              variant="avatar"
              disabled={!onAssigneeChange}
            />
          </div>
        </div>

        {/* Title row with priority and status icons */}
        <div className="flex items-start gap-2">
          {/* Priority Selector - clickable */}
          <div onClick={(e) => e.stopPropagation()} className="shrink-0 mt-0.5">
            <PrioritySelector
              value={(task.priority ?? 0) as PriorityValue}
              onChange={handlePriorityChange}
              variant="icon-only"
              disabled={!onPriorityChange}
            />
          </div>
          <StatusIcon status={status} className="mt-0.5 shrink-0" />
          <h4 className="text-sm font-medium leading-snug line-clamp-2">
            {task.title}
          </h4>
        </div>

        {/* Bottom row: Component tag and project */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* Component Selector - clickable label */}
          <div onClick={(e) => e.stopPropagation()}>
            <ComponentSelector
              value={component || null}
              onChange={handleComponentChange}
              variant="tag"
              disabled={!onComponentChange}
            />
          </div>

          {/* Project tag (if different from component) */}
          {projectName && projectName !== component && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-muted-foreground bg-muted/50 border border-border/50">
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

          {/* Due date indicator */}
          {task.due_date && (
            <span className="text-xs text-muted-foreground">
              Due: {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export const LinearIssueCard = memo(LinearIssueCardComponent);
