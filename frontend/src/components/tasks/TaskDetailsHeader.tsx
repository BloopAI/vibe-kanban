import { memo, useContext, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { TaskDetailsContext } from '@/components/context/taskDetailsContext.ts';

interface TaskDetailsHeaderProps {
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  hideCloseButton?: boolean;
  isFullScreen?: boolean;
  setFullScreen?: (isFullScreen: boolean) => void;
}

const statusLabels: Record<TaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

const getTaskStatusDotColor = (status: TaskStatus): string => {
  switch (status) {
    case 'todo':
      return 'bg-gray-400';
    case 'inprogress':
      return 'bg-blue-500';
    case 'inreview':
      return 'bg-yellow-500';
    case 'done':
      return 'bg-green-500';
    case 'cancelled':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
};

function TaskDetailsHeader({
  onClose,
  onEditTask,
  onDeleteTask,
  hideCloseButton = false,
  isFullScreen,
  setFullScreen,
}: TaskDetailsHeaderProps) {
  const { task } = useContext(TaskDetailsContext);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  return (
    <div>
      {/* Title and Task Actions */}
      <div className="p-4 pb-2 border-b-2 border-muted">
        {/* Top row: title and action icons */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold mb-1 line-clamp-2">
                {task.title}
                <Chip
                  className="ml-2 -mt-2 relative top-[-2px]"
                  dotColor={getTaskStatusDotColor(task.status)}
                >
                  {statusLabels[task.status]}
                </Chip>
              </h2>
            </div>
            {setFullScreen && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFullScreen(!isFullScreen)}
                      aria-label={
                        isFullScreen
                          ? 'Collapse to sidebar'
                          : 'Expand to fullscreen'
                      }
                    >
                      {isFullScreen ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {isFullScreen
                        ? 'Collapse to sidebar'
                        : 'Expand to fullscreen'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="flex items-center gap-1">
              {onEditTask && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditTask(task)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit task</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {onDeleteTask && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteTask(task.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete task</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {!hideCloseButton && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Close panel</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>

        {/* Description + Status (sidebar view only) lives below icons */}
        {!isFullScreen && (
          <div className="mt-2">
            <div className="p-2 bg-muted/20 rounded border-l-2 border-muted max-h-48 overflow-y-auto">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                {task.description ? (
                  <div className="flex-1 min-w-0">
                    <p
                      className={`whitespace-pre-wrap ${
                        !isDescriptionExpanded && task.description.length > 150
                          ? 'line-clamp-3'
                          : ''
                      }`}
                    >
                      {task.description}
                    </p>
                    {task.description.length > 150 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setIsDescriptionExpanded(!isDescriptionExpanded)
                        }
                        className="mt-1 p-0 h-auto text-xs text-muted-foreground hover:text-foreground"
                      >
                        {isDescriptionExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Show more
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="italic">No description provided</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TaskDetailsHeader);
