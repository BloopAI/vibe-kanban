import { memo } from 'react';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './TaskCard';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusBoardColors, statusLabels } from '@/utils/statusLabels';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type KanbanColumns = Record<TaskStatus, TaskWithAttemptStatus[]>;

interface TaskKanbanBoardProps {
  columns: KanbanColumns;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  selectedTaskId?: string;
  onCreateTask?: () => void;
  projectId: string;
  autoRunEnabled: boolean;
  onAutoRunToggle: (enabled: boolean) => void;
}

function TaskKanbanBoard({
  columns,
  onDragEnd,
  onViewTaskDetails,
  selectedTaskId,
  onCreateTask,
  projectId,
  autoRunEnabled,
  onAutoRunToggle,
}: TaskKanbanBoardProps) {
  const { t } = useTranslation('tasks');

  return (
    <KanbanProvider onDragEnd={onDragEnd}>
      {Object.entries(columns).map(([status, tasks]) => {
        const statusKey = status as TaskStatus;
        return (
          <KanbanBoard key={status} id={statusKey}>
            {statusKey === 'inprogress' ? (
              <KanbanHeader>
                <Card
                  className="sticky top-0 z-20 flex shrink-0 items-center gap-2 p-3 border-b border-dashed bg-background"
                  style={{
                    backgroundImage: `linear-gradient(hsl(var(${statusBoardColors[statusKey]}) / 0.03), hsl(var(${statusBoardColors[statusKey]}) / 0.03))`,
                  }}
                >
                  <span className="flex-1 flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: `hsl(var(${statusBoardColors[statusKey]}))`,
                      }}
                    />
                    <p className="m-0 text-sm">
                      {statusLabels[statusKey]}
                    </p>
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span className="text-xs text-muted-foreground">
                            {t('kanban.autoRun')}
                          </span>
                          <Switch
                            checked={autoRunEnabled}
                            onCheckedChange={onAutoRunToggle}
                            className="scale-75"
                          />
                        </label>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {t('kanban.autoRunTooltip')}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          className="m-0 p-0 h-0 text-foreground/50 hover:text-foreground"
                          onClick={onCreateTask}
                          aria-label={t('actions.addTask')}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {t('actions.addTask')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Card>
              </KanbanHeader>
            ) : (
              <KanbanHeader
                name={statusLabels[statusKey]}
                color={statusBoardColors[statusKey]}
                onAddTask={onCreateTask}
              />
            )}
            <KanbanCards>
              {tasks.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  status={statusKey}
                  onViewDetails={onViewTaskDetails}
                  isOpen={selectedTaskId === task.id}
                  projectId={projectId}
                />
              ))}
            </KanbanCards>
          </KanbanBoard>
        );
      })}
    </KanbanProvider>
  );
}

export default memo(TaskKanbanBoard);
