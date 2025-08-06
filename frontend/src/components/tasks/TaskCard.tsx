import { KeyboardEvent, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import {
  CheckCircle,
  Edit,
  Loader2,
  MoreHorizontal,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { is_planning_executor_type } from '@/lib/utils';
// TODO: Import user components once they are needed
// import { UserAvatar } from '@/components/user/UserAvatar';
// import { UserBadge } from '@/components/user/UserBadge';

type Task = TaskWithAttemptStatus;

interface TaskCardProps {
  task: Task;
  index: number;
  status: string;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onViewDetails: (task: Task) => void;
  isFocused: boolean;
  tabIndex?: number;
}

export function TaskCard({
  task,
  index,
  status,
  onEdit,
  onDelete,
  onViewDetails,
  isFocused,
  tabIndex = -1,
}: TaskCardProps) {
  const localRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isFocused && localRef.current) {
      localRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      localRef.current.focus();
    }
  }, [isFocused]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        onDelete(task.id);
      } else if (e.key === 'Enter' || e.key === ' ') {
        onViewDetails(task);
      }
    },
    [task, onDelete, onViewDetails]
  );

  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  return (
    <KanbanCard
      key={task.id}
      id={task.id}
      name={task.title}
      index={index}
      parent={status}
      onClick={handleClick}
      tabIndex={tabIndex}
      forwardedRef={localRef}
      onKeyDown={handleKeyDown}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-2">
            <div className="mb-1">
              <h4 className="font-medium text-sm break-words">
                {task.latest_attempt_executor &&
                  is_planning_executor_type(task.latest_attempt_executor) && (
                    <Badge className="bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium px-1.5 py-0.5 h-4 text-[10px] mr-1">
                      PLAN
                    </Badge>
                  )}
                {task.title}
              </h4>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {/* In Progress Spinner */}
            {task.has_in_progress_attempt && (
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
            )}
            {/* Merged Indicator */}
            {task.has_merged_attempt && (
              <CheckCircle className="h-3 w-3 text-green-500" />
            )}
            {/* Failed Indicator */}
            {task.last_attempt_failed && !task.has_merged_attempt && (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            {/* Actions Menu */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-muted"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(task)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(task.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        {task.description && (
          <div>
            <p className="text-xs text-muted-foreground break-words">
              {task.description.length > 130
                ? `${task.description.substring(0, 130)}...`
                : task.description}
            </p>
          </div>
        )}
        
        {/* User assignment section - will be enabled once backend provides user data */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {/* TODO: Replace with actual assigned_to user data once available */}
            {/* task.assigned_to ? (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <UserBadge user={task.assigned_to} size="sm" />
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>Unassigned</span>
              </div>
            ) */}
          </div>
          
          {/* TODO: Replace with actual created_by user data once available */}
          {/* task.created_by && (
            <div className="flex items-center gap-1">
              <span>by</span>
              <UserAvatar user={task.created_by} size="sm" />
            </div>
          ) */}
        </div>
      </div>
    </KanbanCard>
  );
}
