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
import type { SortDirection } from '@/lib/taskSorting';

export type KanbanColumnItem = {
  type: 'task';
  task: TaskWithAttemptStatus;
};

export type KanbanColumns = Record<TaskStatus, KanbanColumnItem[]>;

interface TaskKanbanBoardProps {
  columns: KanbanColumns;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  selectedTaskId?: string;
  onCreateTask?: () => void;
  projectId: string;
  /** Current sort direction for each status column */
  sortDirections?: Record<TaskStatus, SortDirection>;
  /** Callback when user clicks to toggle sort direction for a status */
  onSortToggle?: (status: TaskStatus) => void;
}

function TaskKanbanBoard({
  columns,
  onDragEnd,
  onViewTaskDetails,
  selectedTaskId,
  onCreateTask,
  projectId,
  sortDirections,
  onSortToggle,
}: TaskKanbanBoardProps) {
  return (
    <KanbanProvider onDragEnd={onDragEnd}>
      {Object.entries(columns).map(([status, items]) => {
        const statusKey = status as TaskStatus;
        return (
          <KanbanBoard key={status} id={statusKey}>
            <KanbanHeader
              name={statusLabels[statusKey]}
              color={statusBoardColors[statusKey]}
              count={items.length}
              onAddTask={onCreateTask}
              sortDirection={sortDirections?.[statusKey]}
              onSortToggle={
                onSortToggle ? () => onSortToggle(statusKey) : undefined
              }
            />
            <KanbanCards>
              {items.map((item, index) => (
                <TaskCard
                  key={item.task.id}
                  task={item.task}
                  index={index}
                  status={statusKey}
                  onViewDetails={onViewTaskDetails}
                  isOpen={selectedTaskId === item.task.id}
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
