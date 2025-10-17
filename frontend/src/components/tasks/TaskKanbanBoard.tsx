import { memo, useState } from 'react';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
  SortableContext,
  verticalListSortingStrategy,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './TaskCard';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
// import { useParams } from 'react-router-dom';

import { statusBoardColors, statusLabels } from '@/utils/status-labels';

type Task = TaskWithAttemptStatus;

interface TaskKanbanBoardProps {
  groupedTasks: Record<TaskStatus, Task[]>;
  tasksById: Record<string, Task>;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart?: (event: any) => void;
  onViewTaskDetails: (task: Task) => void;
  selectedTask?: Task;
  onCreateTask?: () => void;
}

function TaskKanbanBoard({
  groupedTasks,
  tasksById,
  onDragEnd,
  onDragStart,
  onViewTaskDetails,
  selectedTask,
  onCreateTask,
}: TaskKanbanBoardProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const handleDragStart = (event: any) => {
    setActiveTaskId(event.active.id as string);
    onDragStart?.(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    onDragEnd(event);
  };

  const activeTask = activeTaskId ? tasksById[activeTaskId] : null;

  return (
    <KanbanProvider
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      activeTaskContent={
        activeTask ? (
          <TaskCard
            task={activeTask}
            index={0}
            status={activeTask.status}
            onViewDetails={() => {}}
          />
        ) : null
      }
    >
      {Object.entries(groupedTasks).map(([status, statusTasks]) => {
        const taskIds = statusTasks.map((task) => task.id);

        return (
          <KanbanBoard key={status} id={status as TaskStatus}>
            <KanbanHeader
              name={statusLabels[status as TaskStatus]}
              color={statusBoardColors[status as TaskStatus]}
              onAddTask={onCreateTask}
            />
            <KanbanCards>
              <SortableContext
                items={taskIds}
                strategy={verticalListSortingStrategy}
              >
                {statusTasks.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    index={index}
                    status={status}
                    onViewDetails={onViewTaskDetails}
                    isOpen={selectedTask?.id === task.id}
                  />
                ))}
              </SortableContext>
            </KanbanCards>
          </KanbanBoard>
        );
      })}
    </KanbanProvider>
  );
}

export default memo(TaskKanbanBoard);
