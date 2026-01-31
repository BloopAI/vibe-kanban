import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { TaskCardSwarm } from './TaskCardSwarm';
import type { SwarmTask, Sandbox } from './types';

interface SwarmKanbanProps {
  tasks: SwarmTask[];
  sandboxes: Sandbox[];
  onCreateTask?: () => void;
  onViewExecution?: (taskId: string) => void;
  onRetryTask?: (taskId: string) => void;
}

const columns = [
  { id: 'pending', label: 'Pending', status: 'pending' as const },
  { id: 'running', label: 'Running', status: 'running' as const },
  { id: 'completed', label: 'Completed', status: 'completed' as const },
] as const;

export function SwarmKanban({
  tasks,
  sandboxes,
  onCreateTask,
  onViewExecution,
  onRetryTask,
}: SwarmKanbanProps) {
  const getSandboxForTask = (taskId: string) =>
    sandboxes.find((s) => s.current_task_id === taskId);

  const getTasksByStatus = (status: SwarmTask['status']) =>
    tasks.filter((t) => t.status === status);

  // Failed tasks go to pending column but with different styling
  const pendingTasks = [...getTasksByStatus('pending'), ...getTasksByStatus('failed')];

  return (
    <div className="flex gap-4 h-full overflow-x-auto p-4">
      {columns.map((column) => {
        const columnTasks =
          column.status === 'pending'
            ? pendingTasks
            : getTasksByStatus(column.status);

        return (
          <div
            key={column.id}
            className="flex-1 min-w-[300px] max-w-[400px] flex flex-col"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{column.label}</h3>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {columnTasks.length}
                </span>
              </div>
              {column.status === 'pending' && (
                <Button variant="ghost" size="sm" onClick={onCreateTask}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Column Content */}
            <div className="flex-1 space-y-3 overflow-y-auto">
              {columnTasks.map((task) => (
                <TaskCardSwarm
                  key={task.id}
                  task={task}
                  sandbox={getSandboxForTask(task.id)}
                  onViewExecution={onViewExecution}
                  onRetry={onRetryTask}
                />
              ))}
              {columnTasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
