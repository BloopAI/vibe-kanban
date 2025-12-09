import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSearch } from '@/contexts/SearchContext';
import { useAllTasks } from '@/hooks';
import { paths } from '@/lib/paths';
import {
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { statusBoardColors, statusLabels } from '@/utils/statusLabels';
import { AllProjectsTaskCard } from '@/components/tasks/AllProjectsTaskCard';
import type { TaskWithProjectInfo, TaskStatus } from 'shared/types';

const TASK_STATUSES = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
] as const;

const normalizeStatus = (status: string): TaskStatus =>
  status.toLowerCase() as TaskStatus;

export function AllProjectsTasks() {
  const { t } = useTranslation(['tasks', 'common']);
  const navigate = useNavigate();
  const { query: searchQuery } = useSearch();

  const { tasks, isLoading, error } = useAllTasks();

  const hasSearch = Boolean(searchQuery.trim());
  const normalizedSearch = searchQuery.trim().toLowerCase();

  // Group tasks by status for the Kanban columns
  const kanbanColumns = useMemo(() => {
    const columns: Record<TaskStatus, TaskWithProjectInfo[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    const matchesSearch = (
      title: string,
      description?: string | null,
      projectName?: string
    ): boolean => {
      if (!hasSearch) return true;
      const lowerTitle = title.toLowerCase();
      const lowerDescription = description?.toLowerCase() ?? '';
      const lowerProject = projectName?.toLowerCase() ?? '';
      return (
        lowerTitle.includes(normalizedSearch) ||
        lowerDescription.includes(normalizedSearch) ||
        lowerProject.includes(normalizedSearch)
      );
    };

    tasks.forEach((task) => {
      const statusKey = normalizeStatus(task.status);
      if (!matchesSearch(task.title, task.description, task.project_name)) {
        return;
      }
      columns[statusKey].push(task);
    });

    // Sort by updated_at (most recent first)
    TASK_STATUSES.forEach((status) => {
      columns[status].sort(
        (a, b) =>
          new Date(b.updated_at as string).getTime() -
          new Date(a.updated_at as string).getTime()
      );
    });

    return columns;
  }, [tasks, hasSearch, normalizedSearch]);

  const hasVisibleTasks = useMemo(
    () =>
      Object.values(kanbanColumns).some((items) => items && items.length > 0),
    [kanbanColumns]
  );

  const handleViewTaskDetails = useCallback(
    (task: TaskWithProjectInfo) => {
      navigate(`${paths.task(task.project_id, task.id)}/attempts/latest`);
    },
    [navigate]
  );

  // For drag-and-drop status changes (disabled in all-projects view)
  const handleDragEnd = useCallback(() => {
    // Status changes via drag disabled in all-projects view
    // Could be implemented later if needed
  }, []);

  if (error) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('common:states.error')}
          </AlertTitle>
          <AlertDescription>
            {error.message || 'Failed to load tasks'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading && tasks.length === 0) {
    return <Loader message={t('loading')} size={32} className="py-8" />;
  }

  const kanbanContent =
    tasks.length === 0 ? (
      <div className="max-w-7xl mx-auto mt-8">
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">{t('empty.noTasks')}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {t('tasks:allProjects.selectProject', {
                defaultValue: 'Select a project to create tasks',
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    ) : !hasVisibleTasks ? (
      <div className="max-w-7xl mx-auto mt-8">
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">
              {t('empty.noSearchResults')}
            </p>
          </CardContent>
        </Card>
      </div>
    ) : (
      <div className="w-full h-full overflow-x-auto overflow-y-auto overscroll-x-contain">
        <KanbanProvider onDragEnd={handleDragEnd}>
          {TASK_STATUSES.map((status) => {
            const items = kanbanColumns[status];
            return (
              <KanbanBoard key={status} id={status}>
                <KanbanHeader
                  name={statusLabels[status]}
                  color={statusBoardColors[status]}
                />
                <KanbanCards>
                  {items.map((task, index) => (
                    <AllProjectsTaskCard
                      key={task.id}
                      task={task}
                      index={index}
                      status={status}
                      onViewDetails={handleViewTaskDetails}
                    />
                  ))}
                </KanbanCards>
              </KanbanBoard>
            );
          })}
        </KanbanProvider>
      </div>
    );

  return (
    <div className="min-h-full h-full flex flex-col">
      <div className="flex-1 min-h-0 p-2">{kanbanContent}</div>
    </div>
  );
}
