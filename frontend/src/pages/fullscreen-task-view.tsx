import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader } from '@/components/ui/loader';
import { useProject } from '@/contexts/project-context';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { paths } from '@/lib/paths';
import { useKeyExit, Scope } from '@/keyboard';
import { useHotkeysContext } from 'react-hotkeys-hook';
import KanbanSidebar from '@/components/panels/KanbanSidebar';

export function FullscreenTaskView() {
  const { taskId } = useParams<{
    projectId: string;
    taskId: string;
  }>();
  const navigate = useNavigate();
  const { enableScope, disableScope } = useHotkeysContext();

  const { projectId, isLoading: projectLoading } = useProject();

  useEffect(() => {
    enableScope(Scope.KANBAN);
    return () => {
      disableScope(Scope.KANBAN);
    };
  }, [enableScope, disableScope]);

  const { tasksById, isLoading } = useProjectTasks(projectId || '');

  const selectedTask = useMemo(
    () => (taskId ? (tasksById[taskId] ?? null) : null),
    [taskId, tasksById]
  );

  useKeyExit(
    () => {
      if (projectId && taskId) {
        navigate(paths.task(projectId, taskId));
      } else if (projectId) {
        navigate(paths.projectTasks(projectId));
      }
    },
    { scope: Scope.KANBAN }
  );

  if (projectLoading && isLoading) {
    return <Loader message="Loading..." size={32} className="py-8" />;
  }

  return (
    <div className="h-full w-full">
      <KanbanSidebar selectedTask={selectedTask} />
    </div>
  );
}
