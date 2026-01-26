import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import {
  GlobalTaskCard,
  PROJECT_COLORS,
  type ProjectColor,
} from '@/components/tasks/GlobalTaskCard';
import { useGlobalTasks } from '@/hooks/useGlobalTasks';
import { useNavigateWithSearch } from '@/hooks';
import { tasksApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import type { GlobalTaskWithAttemptStatus, TaskStatus } from 'shared/types';
import { statusBoardColors, statusLabels } from '@/utils/statusLabels';

export default function GlobalTasksView() {
  const { t } = useTranslation('projects');
  const navigate = useNavigateWithSearch();
  const { tasksByStatus, tasksById, isLoading, error } = useGlobalTasks();

  const handleViewTaskDetails = useCallback(
    (task: GlobalTaskWithAttemptStatus) => {
      navigate(paths.task(task.project_id, task.id));
    },
    [navigate]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const draggedTaskId = active.id as string;
      const newStatus = over.id as TaskStatus;
      const task = tasksById[draggedTaskId];

      if (!task || task.status === newStatus) return;

      try {
        await tasksApi.update(draggedTaskId, {
          title: task.title,
          description: task.description,
          status: newStatus,
          parent_workspace_id: task.parent_workspace_id,
          image_ids: null,
        });
      } catch (err) {
        console.error('Failed to update task status:', err);
      }
    },
    [tasksById]
  );

  const columns = useMemo(() => {
    const result: Record<TaskStatus, GlobalTaskWithAttemptStatus[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    for (const [status, tasks] of Object.entries(tasksByStatus)) {
      result[status as TaskStatus] = tasks;
    }

    return result;
  }, [tasksByStatus]);

  const projectColorMap = useMemo(() => {
    const uniqueProjectIds = new Set<string>();
    Object.values(tasksByStatus).forEach((tasks) => {
      tasks.forEach((task) => uniqueProjectIds.add(task.project_id));
    });

    const sortedProjectIds = Array.from(uniqueProjectIds).sort();
    const colorMap = new Map<string, ProjectColor>();

    sortedProjectIds.forEach((projectId, index) => {
      colorMap.set(projectId, PROJECT_COLORS[index % PROJECT_COLORS.length]);
    });

    return colorMap;
  }, [tasksByStatus]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('globalView.loading', 'Loading tasks...')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center py-12">
        {t('globalView.error', 'Failed to load tasks')}
      </div>
    );
  }

  const hasNoTasks = Object.values(columns).every(
    (tasks) => tasks.length === 0
  );

  if (hasNoTasks) {
    return (
      <div className="text-muted-foreground text-center py-12">
        {t('globalView.noTasks', 'No tasks found across any projects')}
      </div>
    );
  }

  return (
    <KanbanProvider onDragEnd={handleDragEnd}>
      {Object.entries(columns).map(([status, tasks]) => {
        const statusKey = status as TaskStatus;
        return (
          <KanbanBoard key={status} id={statusKey}>
            <KanbanHeader
              name={statusLabels[statusKey]}
              color={statusBoardColors[statusKey]}
            />
            <KanbanCards>
              {tasks.map((task, index) => (
                <GlobalTaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  status={statusKey}
                  onViewDetails={handleViewTaskDetails}
                  projectColor={projectColorMap.get(task.project_id)!}
                />
              ))}
            </KanbanCards>
          </KanbanBoard>
        );
      })}
    </KanbanProvider>
  );
}
