import { memo, useState } from 'react';
import { useAuth } from '@/hooks';
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
import WorkflowVisualization from '@/components/workflows/WorkflowVisualization';

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
  showWorkflowVisualization?: boolean;
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
  showWorkflowVisualization = false,
}: TaskKanbanBoardProps) {
  const { userId } = useAuth();
  const [workflowTaskId, setWorkflowTaskId] = useState<string | null>(null);

  return (
    <div className="flex gap-4 h-full">
      <KanbanProvider onDragEnd={onDragEnd}>
        <div className="flex-1 flex overflow-x-auto">
          {Object.entries(columns).map(([status, items]) => {
            const statusKey = status as TaskStatus;
            return (
              <KanbanBoard key={status} id={statusKey}>
                <KanbanHeader
                  name={statusLabels[statusKey]}
                  color={statusBoardColors[statusKey]}
                  onAddTask={onCreateTask}
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
                          onShowWorkflow={
                            showWorkflowVisualization
                              ? () => setWorkflowTaskId(item.task.id)
                              : undefined
                          }
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
        </div>
      </KanbanProvider>

      {/* Workflow Visualization Panel */}
      {showWorkflowVisualization && workflowTaskId && (
        <div className="w-96 border-l bg-background overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Workflow</h3>
              <button
                onClick={() => setWorkflowTaskId(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <WorkflowVisualization taskId={workflowTaskId} compact={false} />
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(TaskKanbanBoard);
