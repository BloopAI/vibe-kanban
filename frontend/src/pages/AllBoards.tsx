import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useProjectTasks, SharedTaskRecord } from '@/hooks/useProjectTasks';
import { useAuth } from '@/hooks';
import TaskKanbanBoard, {
  KanbanColumnItem,
} from '@/components/tasks/TaskKanbanBoard';
import { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { openTaskForm } from '@/lib/openTaskForm';
import { tasksApi } from '@/lib/api';
import { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import { Loader } from '@/components/ui/loader';
import { paths } from '@/lib/paths';
import { TaskDetailSidebar } from '@/components/tasks/TaskDetailSidebar';

const TASK_STATUSES = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
] as const;

const normalizeStatus = (status: string): TaskStatus =>
  status.toLowerCase() as TaskStatus;

const ProjectKanbanRow = memo(({ 
  projectId, 
  projectName, 
  onTaskClick 
}: { 
  projectId: string; 
  projectName: string;
  onTaskClick: (task: TaskWithAttemptStatus) => void;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { userId } = useAuth();
  const navigate = useNavigate();

  // Native IntersectionObserver for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Load 200px before it comes into view
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const {
    tasks,
    tasksById,
    sharedTasksById,
    sharedOnlyByStatus,
    isLoading,
  } = useProjectTasks(isVisible ? projectId : '');

  // Transform tasks to columns (Simplified version of ProjectTasks.tsx logic)
  const kanbanColumns = useMemo(() => {
    const columns: Record<TaskStatus, KanbanColumnItem[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    if (!isVisible) return columns;

    tasks.forEach((task) => {
      const statusKey = normalizeStatus(task.status);
      const sharedTask = task.shared_task_id
        ? sharedTasksById[task.shared_task_id]
        : sharedTasksById[task.id];

      columns[statusKey].push({
        type: 'task',
        task,
        sharedTask,
      });
    });

    (Object.entries(sharedOnlyByStatus) as [TaskStatus, SharedTaskRecord[]][]).forEach(
      ([status, items]) => {
        if (!columns[status]) columns[status] = [];
        items.forEach((sharedTask) => {
          // Include shared tasks assigned to user or if we want to show all (defaulting to show owned for simplicity here)
          const shouldIncludeShared = sharedTask.assignee_user_id === userId;
          if (shouldIncludeShared) {
            columns[status].push({
              type: 'shared',
              task: sharedTask,
            });
          }
        });
      }
    );

    // Sort by date
    const getTimestamp = (item: KanbanColumnItem) => {
      const createdAt =
        item.type === 'task' ? item.task.created_at : item.task.created_at;
      return new Date(createdAt).getTime();
    };

    TASK_STATUSES.forEach((status) => {
      columns[status].sort((a, b) => getTimestamp(b) - getTimestamp(a));
    });

    return columns;
  }, [tasks, sharedTasksById, sharedOnlyByStatus, userId, isVisible]);

  // Handlers
  const handleViewTaskDetails = (task: TaskWithAttemptStatus) => {
    onTaskClick(task);
  };

  const handleCreateTask = () => {
    openTaskForm({ mode: 'create', projectId, skipNavigation: true });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !active.data.current) return;

    const draggedTaskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    
    // Find the task locally to get its current properties
    const task = tasksById[draggedTaskId];
    
    // If task not found or status hasn't changed, do nothing
    if (!task || task.status === newStatus) return;

    try {
      await tasksApi.update(draggedTaskId, {
        title: task.title,
        description: task.description,
        status: newStatus,
        parent_workspace_id: task.parent_workspace_id,
        image_ids: null, // explicit null as per original implementation logic if needed, or omit if optional
      });
      // No need to manually update local state; the WebSocket stream from useProjectTasks will handle it.
    } catch (err) {
      console.error('Failed to update task status:', err);
      // Optional: Add toast error here
    }
  };

  return (
    <div ref={containerRef} className="mb-8 min-h-[300px]">
      <div className="flex items-center justify-between mb-4 px-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          {projectName}
        </h2>
        <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${projectId}/tasks`)}>
          Go to Project
        </Button>
      </div>

      {isVisible ? (
        isLoading ? (
          <div className="flex justify-center py-12">
            <Loader size={24} message="Loading tasks..." />
          </div>
        ) : (
          <div className="overflow-x-auto pb-4 px-4">
            <TaskKanbanBoard
              columns={kanbanColumns}
              onDragEnd={handleDragEnd}
              onViewTaskDetails={handleViewTaskDetails}
              onCreateTask={handleCreateTask}
              projectId={projectId}
            />
          </div>
        )
      ) : (
        <div className="h-[300px] flex items-center justify-center bg-muted/20 rounded-lg mx-4 border border-dashed">
          <span className="text-muted-foreground">Scroll to load...</span>
        </div>
      )}
    </div>
  );
});

ProjectKanbanRow.displayName = 'ProjectKanbanRow';

export function AllBoardsPage() {
  const { projects, isLoading } = useProjects();
  const { t } = useTranslation();
  const [activeTask, setActiveTask] = useState<{ task: TaskWithAttemptStatus, projectId: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader size={32} message="Loading projects..." />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <Card>
          <CardHeader>
            <CardTitle>{t('empty.noProjects')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">You don't have any projects yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      <div className="container mx-auto py-6 max-w-[1800px]">
        <h1 className="text-2xl font-bold mb-6 px-4">All Boards</h1>
        <div className="space-y-8">
          {projects.map((project) => (
            <ProjectKanbanRow
              key={project.id}
              projectId={project.id}
              projectName={project.name}
              onTaskClick={(task) => setActiveTask({ task, projectId: project.id })}
            />
          ))}
        </div>
      </div>
      
      {activeTask && (
        <TaskDetailSidebar
          task={activeTask.task}
          projectId={activeTask.projectId}
          onClose={() => setActiveTask(null)}
        />
      )}
    </div>
  );
}
