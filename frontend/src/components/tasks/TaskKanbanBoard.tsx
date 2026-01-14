import { memo, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { Button } from '@/components/ui/button';
import { TaskCard } from './TaskCard';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusBoardColors, statusLabels } from '@/utils/statusLabels';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { SharedTaskCard } from './SharedTaskCard';
import { HiddenColumnsDropdown } from './HiddenColumnsDropdown';
import { PrioritizeTasksDialog } from '@/components/dialogs/tasks/PrioritizeTasksDialog';

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
  hiddenColumns?: TaskStatus[];
  onToggleHiddenColumn?: (column: TaskStatus) => void;
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
  hiddenColumns = [],
  onToggleHiddenColumn,
}: TaskKanbanBoardProps) {
  const { userId } = useAuth();
  const { t } = useTranslation('tasks');

  const visibleColumns = useMemo(() => {
    return Object.entries(columns).filter(
      ([status]) => !hiddenColumns.includes(status as TaskStatus)
    );
  }, [columns, hiddenColumns]);

  // Collect all local tasks for prioritization
  const allTasks = useMemo(() => {
    const tasks: TaskWithAttemptStatus[] = [];
    for (const items of Object.values(columns)) {
      for (const item of items) {
        if (item.type === 'task') {
          tasks.push(item.task);
        }
      }
    }
    return tasks;
  }, [columns]);

  const handlePrioritize = useCallback(() => {
    PrioritizeTasksDialog.show({ projectId, tasks: allTasks });
  }, [projectId, allTasks]);

  return (
    <KanbanProvider
      onDragEnd={onDragEnd}
      rightContent={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrioritize}
            disabled={allTasks.length === 0}
            className="h-8"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {t('prioritize.button', 'Prioritize')}
          </Button>
          {onToggleHiddenColumn && (
            <HiddenColumnsDropdown
              hiddenColumns={hiddenColumns}
              onToggleColumn={onToggleHiddenColumn}
              columns={columns}
            />
          )}
        </div>
      }
    >
      {visibleColumns.map(([status, items]) => {
        const statusKey = status as TaskStatus;
        return (
          <KanbanBoard key={status} id={statusKey}>
            <KanbanHeader
              name={statusLabels[statusKey]}
              color={statusBoardColors[statusKey]}
              onAddTask={onCreateTask}
              count={items.length}
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
                    />
                  );
                }

                const sharedTask =
                  item.type === 'shared' ? item.task : item.sharedTask!;

                return (
                  <SharedTaskCard
                    key={`shared-${item.task.id}`}
                    task={sharedTask}
                    index={index}
                    status={statusKey}
                    isSelected={selectedSharedTaskId === item.task.id}
                    onViewDetails={onViewSharedTask}
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
