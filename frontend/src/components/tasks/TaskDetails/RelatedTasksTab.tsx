import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TaskDetailsContext,
  TaskRelatedTasksContext,
} from '@/components/context/taskDetailsContext.ts';
import { attemptsApi, tasksApi } from '@/lib/api.ts';
import type { Task, TaskAttempt } from 'shared/types.ts';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

function RelatedTasksTab() {
  const { task, projectId } = useContext(TaskDetailsContext);
  const { relatedTasks, relatedTasksLoading, relatedTasksError } = useContext(
    TaskRelatedTasksContext
  );
  const navigate = useNavigate();

  // State for parent task details
  const [parentTaskDetails, setParentTaskDetails] = useState<{
    task: Task;
    attempt: TaskAttempt;
  } | null>(null);
  const [parentTaskLoading, setParentTaskLoading] = useState(false);

  const handleTaskClick = (relatedTask: any) => {
    navigate(`/projects/${projectId}/tasks/${relatedTask.id}`);
  };

  const hasParent = task?.parent_task_attempt;
  const children = relatedTasks || [];

  // Fetch parent task details when component mounts
  useEffect(() => {
    const fetchParentTaskDetails = async () => {
      if (!task?.parent_task_attempt) {
        setParentTaskDetails(null);
        return;
      }

      setParentTaskLoading(true);
      try {
        const attemptData = await attemptsApi.getDetails(
          task.parent_task_attempt
        );
        const parentTask = await tasksApi.getById(
          projectId,
          attemptData.task_id
        );
        setParentTaskDetails({
          task: parentTask,
          attempt: attemptData,
        });
      } catch (error) {
        console.error('Error fetching parent task details:', error);
        setParentTaskDetails(null);
      } finally {
        setParentTaskLoading(false);
      }
    };

    fetchParentTaskDetails();
  }, [task?.parent_task_attempt, projectId]);

  const handleParentClick = async () => {
    if (task?.parent_task_attempt) {
      try {
        const attemptData = await attemptsApi.getDetails(
          task.parent_task_attempt
        );
        navigate(
          `/projects/${projectId}/tasks/${attemptData.task_id}?attempt=${task.parent_task_attempt}`
        );
      } catch (error) {
        console.error('Error navigating to parent task:', error);
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inprogress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'inreview':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  if (relatedTasksLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (relatedTasksError) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{relatedTasksError}</p>
        </div>
      </div>
    );
  }

  const totalRelatedTasks = (hasParent ? 1 : 0) + children.length;

  if (totalRelatedTasks === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-muted-foreground">
            <p>No related tasks found.</p>
            <p className="text-sm mt-2">
              This task doesn't have any parent task or subtasks.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Parent Task */}
      {hasParent && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <ArrowUp className="h-4 w-4" />
            Parent Task
          </h3>
          <button
            onClick={handleParentClick}
            className="w-full bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer text-left"
          >
            {parentTaskLoading ? (
              <div className="flex items-center gap-4">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <div className="text-muted-foreground">
                  Loading parent task...
                </div>
              </div>
            ) : parentTaskDetails ? (
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    {parentTaskDetails.task.title}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(
                      parentTaskDetails.attempt.created_at
                    ).toLocaleDateString()}{' '}
                    {new Date(
                      parentTaskDetails.attempt.created_at
                    ).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="text-muted-foreground">
                  Parent task (failed to load details)
                </div>
              </div>
            )}
          </button>
        </div>
      )}

      {/* Child Tasks */}
      {children.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <ArrowDown className="h-4 w-4" />
            Child Tasks ({children.length})
          </h3>
          <div className="space-y-3">
            {children.map((childTask) => (
              <button
                key={childTask.id}
                onClick={() => handleTaskClick(childTask)}
                className="w-full bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-4">
                  {getStatusIcon(childTask.status)}
                  <span className="font-medium text-foreground">
                    {childTask.title}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default RelatedTasksTab;
