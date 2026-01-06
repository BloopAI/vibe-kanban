import { memo, useCallback, useMemo } from 'react';
import { useAuth, useCollapsedCards } from '@/hooks';
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
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { SharedTaskCard } from './SharedTaskCard';

export type KanbanColumnItem =
  | {
      type: 'task';
      task: TaskWithAttemptStatus;
      sharedTask?: SharedTaskRecord;
    }
  | {
      type: 'shared';
      task: SharedTaskRecord;
    };

export type KanbanColumns = Record<TaskStatus, KanbanColumnItem[]>;

interface TaskKanbanBoardProps {
  columns: KanbanColumns;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onViewSharedTask?: (task: SharedTaskRecord) => void;
  selectedTaskId?: string;
  selectedSharedTaskId?: string | null;
  onCreateTask?: () => void;
  projectId: string;
}

function TaskKanbanBoard({
  columns,
  onDragEnd,
  onViewTaskDetails,
  onViewSharedTask,
  selectedTaskId,
  selectedSharedTaskId,
  onCreateTask,
  projectId,
}: TaskKanbanBoardProps) {
  const { userId } = useAuth();
  const {
    isCollapsed,
    toggleCollapsed,
    collapseAll,
    expandAll,
    areAllCollapsed,
  } = useCollapsedCards(projectId);

  // calcular IDs de tarjetas por columna para collapse all
  const columnCardIds = useMemo(() => {
    const result: Record<TaskStatus, string[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    Object.entries(columns).forEach(([status, items]) => {
      const statusKey = status as TaskStatus;
      result[statusKey] = items.map((item) => {
        if (item.type === 'shared') {
          return `shared-${item.task.id}`;
        }
        return item.task.id;
      });
    });

    return result;
  }, [columns]);

  const handleCollapseColumn = useCallback(
    (status: TaskStatus) => {
      collapseAll(columnCardIds[status]);
    },
    [collapseAll, columnCardIds]
  );

  const handleExpandColumn = useCallback(
    (status: TaskStatus) => {
      expandAll(columnCardIds[status]);
    },
    [expandAll, columnCardIds]
  );

  return (
    <KanbanProvider onDragEnd={onDragEnd}>
      {Object.entries(columns).map(([status, items]) => {
        const statusKey = status as TaskStatus;
        const cardIds = columnCardIds[statusKey];
        const allCollapsed = areAllCollapsed(cardIds);

        return (
          <KanbanBoard key={status} id={statusKey}>
            <KanbanHeader
              name={statusLabels[statusKey]}
              color={statusBoardColors[statusKey]}
              onAddTask={onCreateTask}
              onCollapseAll={() => handleCollapseColumn(statusKey)}
              onExpandAll={() => handleExpandColumn(statusKey)}
              allCollapsed={allCollapsed}
            />
            <KanbanCards>
              {items.map((item, index) => {
                const isOwnTask =
                  item.type === 'task' &&
                  (!item.sharedTask?.assignee_user_id ||
                    !userId ||
                    item.sharedTask?.assignee_user_id === userId);

                if (isOwnTask) {
                  return (
                    <TaskCard
                      key={item.task.id}
                      task={item.task}
                      index={index}
                      status={statusKey}
                      onViewDetails={onViewTaskDetails}
                      isOpen={selectedTaskId === item.task.id}
                      projectId={projectId}
                      sharedTask={item.sharedTask}
                      isCollapsed={isCollapsed(item.task.id)}
                      onToggleCollapsed={toggleCollapsed}
                    />
                  );
                }

                const sharedTask =
                  item.type === 'shared' ? item.task : item.sharedTask!;
                const sharedCardId = `shared-${item.task.id}`;

                return (
                  <SharedTaskCard
                    key={sharedCardId}
                    task={sharedTask}
                    index={index}
                    status={statusKey}
                    isSelected={selectedSharedTaskId === item.task.id}
                    onViewDetails={onViewSharedTask}
                    isCollapsed={isCollapsed(sharedCardId)}
                    onToggleCollapsed={toggleCollapsed}
                  />
                );
              })}
            </KanbanCards>
          </KanbanBoard>
        );
      })}
    </KanbanProvider>
  );
}

export default memo(TaskKanbanBoard);
