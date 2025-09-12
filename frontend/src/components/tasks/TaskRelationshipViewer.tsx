import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { TaskRelationshipCard } from './TaskRelationshipCard';
import { attemptsApi } from '@/lib/api';
import type {
  TaskAttempt,
  TaskRelationships,
  TaskWithAttemptStatus,
} from 'shared/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskRelationshipViewerProps {
  selectedAttempt: TaskAttempt | null;
  onNavigateToTask?: (taskId: string) => void;
  task?: TaskWithAttemptStatus | null;
  tasksById?: Record<string, TaskWithAttemptStatus>;
}

export function TaskRelationshipViewer({
  selectedAttempt,
  onNavigateToTask,
  task,
  tasksById,
}: TaskRelationshipViewerProps) {
  const [relationships, setRelationships] = useState<TaskRelationships | null>(
    null
  );
  const [parentTask, setParentTask] = useState<TaskWithAttemptStatus | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [childrenExpanded, setChildrenExpanded] = useState(true);

  // Effect for attempt-based relationships (existing behavior)
  useEffect(() => {
    if (!selectedAttempt?.id) {
      setRelationships(null);
      return;
    }

    const fetchRelationships = async () => {
      setLoading(true);
      setError(null);
      try {
        const relationshipData = await attemptsApi.getChildren(
          selectedAttempt.id
        );
        setRelationships(relationshipData);
      } catch (err) {
        console.error('Failed to fetch task relationships:', err);
        setError('Failed to load task relationships');
      } finally {
        setLoading(false);
      }
    };

    fetchRelationships();
  }, [selectedAttempt?.id]);

  // Effect for parent task when child has no attempts (one request + tasksById lookup)
  useEffect(() => {
    if (selectedAttempt?.id) {
      // If we have an attempt, clear parent task since relationships will handle it
      setParentTask(null);
      return;
    }

    if (task?.parent_task_attempt && tasksById) {
      attemptsApi
        .get(task.parent_task_attempt)
        .then((parentAttempt) => {
          // Use existing tasksById instead of second API call
          const parentTaskData = tasksById[parentAttempt.task_id];
          setParentTask(parentTaskData || null);
        })
        .catch(() => setParentTask(null));
    } else {
      setParentTask(null);
    }
  }, [selectedAttempt?.id, task?.parent_task_attempt, tasksById]);

  const displayParentTask = relationships?.parent_task || parentTask;
  const childTasks = relationships?.children || [];
  const hasParent = displayParentTask !== null;
  const hasChildren = childTasks.length > 0;

  // Don't render if no relationships and no current task
  if (!hasParent && !hasChildren && !loading && !error) {
    return null;
  }

  return (
    <div>
      <Card className="bg-background p-3 border border-dashed text-sm">
        Task Relationships
      </Card>
      <div className="p-3 space-y-6">
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Loading relationships...
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-8 text-center">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Parent Task Section */}
            {hasParent && displayParentTask && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Parent Task
                  </h4>
                  <div className="flex-1 h-px bg-border"></div>
                </div>
                <div className="flex justify-center">
                  <div className="w-full max-w-md">
                    <TaskRelationshipCard
                      task={displayParentTask}
                      isCurrentTask={false}
                      onClick={() => onNavigateToTask?.(displayParentTask.id)}
                      className="shadow-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Child Tasks Section */}
            {hasChildren && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setChildrenExpanded(!childrenExpanded)}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                  >
                    {childrenExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    Child Tasks ({childTasks.length})
                  </button>
                  <div className="flex-1 h-px bg-border"></div>
                </div>

                {childrenExpanded && (
                  <div
                    className={cn(
                      'grid gap-4',
                      // Responsive grid: 1 col on mobile, 2 on tablet, 3 on desktop
                      'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
                      // Adjust based on number of children
                      childTasks.length === 1 &&
                        'md:grid-cols-1 xl:grid-cols-1 max-w-md mx-auto',
                      childTasks.length === 2 && 'md:grid-cols-2 xl:grid-cols-2'
                    )}
                  >
                    {childTasks.map((childTask) => (
                      <TaskRelationshipCard
                        key={childTask.id}
                        task={childTask}
                        isCurrentTask={false}
                        onClick={() => onNavigateToTask?.(childTask.id)}
                        className="shadow-sm hover:shadow-md transition-shadow"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
