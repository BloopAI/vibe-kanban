import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader } from '@/components/ui/loader';
import { TaskDetailsPanel } from '@/components/tasks/TaskDetailsPanel';
import { projectsApi, tasksApi } from '@/lib/api';
import type { TaskWithAttemptStatus, Project } from 'shared/types';

export function TaskDetailsPage() {
  const { projectId, taskId, attemptId } = useParams<{
    projectId: string;
    taskId: string;
    attemptId?: string;
  }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<TaskWithAttemptStatus | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    navigate(`/projects/${projectId}/tasks`, { replace: true });
  };

  const handleEditTask = (task: TaskWithAttemptStatus) => {
    // Navigate back to main task page and trigger edit
    navigate(`/projects/${projectId}/tasks/${task.id}`);
  };

  const handleDeleteTask = () => {
    // Navigate back to main task page after deletion
    // navigate(`/projects/${projectId}/tasks`);
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!projectId || !taskId) {
        setError('Missing project or task ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch both project and tasks in parallel
        const [projectResult, tasksResult] = await Promise.all([
          projectsApi.getById(projectId),
          tasksApi.getAll(projectId),
        ]);

        // Find the specific task from the list (to get TaskWithAttemptStatus)
        const foundTask = tasksResult.find((t) => t.id === taskId);

        if (!foundTask) {
          setError('Task not found');
          setLoading(false);
          return;
        }

        setProject(projectResult);
        setTask(foundTask);
      } catch (err) {
        console.error('Failed to fetch task details:', err);
        setError('Failed to load task details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId, taskId, attemptId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Loading task details..." size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-destructive text-lg mb-4">{error}</div>
          <button
            onClick={handleClose}
            className="text-primary hover:underline"
          >
            Back to tasks
          </button>
        </div>
      </div>
    );
  }

  if (!task || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-muted-foreground text-lg mb-4">
            Task not found
          </div>
          <button
            onClick={handleClose}
            className="text-primary hover:underline"
          >
            Back to tasks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TaskDetailsPanel
        task={task}
        projectHasDevScript={!!project.dev_script}
        projectId={projectId!}
        onClose={handleClose}
        onEditTask={handleEditTask}
        onDeleteTask={handleDeleteTask}
        hideBackdrop={true}
        hideHeader={true}
        className="w-full h-screen flex flex-col"
      />
    </div>
  );
}
