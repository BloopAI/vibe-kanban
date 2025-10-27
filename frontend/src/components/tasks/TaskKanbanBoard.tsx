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
// import { useParams } from 'react-router-dom';

import { statusBoardColors, statusLabels } from '@/utils/status-labels';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';

type Task = TaskWithAttemptStatus;

interface TaskKanbanBoardProps {
  groupedTasks: Record<TaskStatus, Task[]>;
  sharedTasksById?: Record<string, SharedTaskRecord>;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: Task) => void;
  selectedTask?: Task;
  onCreateTask?: () => void;
  projectId: string;
}

function TaskKanbanBoard({
  groupedTasks,
  sharedTasksById,
  onDragEnd,
  onViewTaskDetails,
  selectedTask,
  onCreateTask,
  projectId,
}: TaskKanbanBoardProps) {
  return (
    <KanbanProvider onDragEnd={onDragEnd}>
      {Object.entries(groupedTasks).map(([status, statusTasks]) => (
        <KanbanBoard key={status} id={status as TaskStatus}>
          <KanbanHeader
            name={statusLabels[status as TaskStatus]}
            color={statusBoardColors[status as TaskStatus]}
            onAddTask={onCreateTask}
          />
          <KanbanCards>
            {statusTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                status={status}
                onViewDetails={onViewTaskDetails}
                isOpen={selectedTask?.id === task.id}
                projectId={projectId}
                sharedTask={
                  sharedTasksById
                    ? task.shared_task_id
                      ? sharedTasksById[task.shared_task_id]
                      : sharedTasksById[task.id]
                    : undefined
                }
              />
            ))}
          </KanbanCards>
        </KanbanBoard>
      ))}
    </KanbanProvider>
  );
}

export default memo(TaskKanbanBoard);
