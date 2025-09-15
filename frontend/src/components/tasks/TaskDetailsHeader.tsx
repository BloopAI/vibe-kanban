import { memo } from 'react';
import { Edit, Trash2, X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TaskWithAttemptStatus } from 'shared/types';
import { TaskTitleDescription } from './TaskDetails/TaskTitleDescription';
import { Card } from '../ui/card';
import { statusBoardColors, statusLabels } from '@/utils/status-labels';
import { useTaskViewManager } from '@/hooks/useTaskViewManager';

interface TaskDetailsHeaderProps {
  task: TaskWithAttemptStatus;
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  hideCloseButton?: boolean;
  isFullScreen?: boolean;
}

// backgroundColor: `hsl(var(${statusBoardColors[task.status]}) / 0.03)`,

function TaskDetailsHeader({
  task,
  onClose,
  onEditTask,
  onDeleteTask,
  hideCloseButton = false,
  isFullScreen,
}: TaskDetailsHeaderProps) {
  const { toggleFullscreen } = useTaskViewManager();
  return (
    <div>
      <Card
        className="flex shrink-0 items-center gap-2 border-b border-dashed bg-background"
        style={{}}
      >
        <div className="p-3 flex flex-1 items-center truncate">
          <div
            className="h-2 w-2 rounded-full inline-block"
            style={{
              backgroundColor: `hsl(var(${statusBoardColors[task.status]}))`,
            }}
          />
          <p className="ml-2 text-sm">{statusLabels[task.status]}</p>
        </div>
        <div className="mr-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleFullscreen(!isFullScreen)}
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
                    <Trash2 className="h-4 w-4 text-destructive" />
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
      </Card>

      {/* Title and Task Actions */}
      {!isFullScreen && (
        <div className="p-3 border-b border-dashed max-h-96 overflow-y-auto">
          <TaskTitleDescription task={task} />
        </div>
      )}
    </div>
  );
}

export default memo(TaskDetailsHeader);
