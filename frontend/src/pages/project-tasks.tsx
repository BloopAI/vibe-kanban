import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Plus } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi } from '@/lib/api';
import { openTaskForm } from '@/lib/openTaskForm';

import { useSearch } from '@/contexts/search-context';
import { useProject } from '@/contexts/project-context';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { paths } from '@/lib/paths';
import {
  useKeyCreate,
  useKeyExit,
  useKeyFocusSearch,
  useKeyNavUp,
  useKeyNavDown,
  useKeyNavLeft,
  useKeyNavRight,
  useKeyOpenDetails,
  Scope,
  useKeyDeleteTask,
  useKeyboardShortcut,
} from '@/keyboard';

import TaskKanbanBoard from '@/components/tasks/TaskKanbanBoard';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import NiceModal from '@ebay/nice-modal-react';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { TasksLayout, type LayoutMode } from '@/components/layout/TasksLayout';
import { PreviewPanel } from '@/components/panels/PreviewPanel';
import { DiffsPanel } from '@/components/panels/DiffsPanel';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import { NewCard, NewCardHeader } from '@/components/ui/new-card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AttemptHeaderActions } from '@/components/panels/AttemptHeaderActions';

type Task = TaskWithAttemptStatus;

const TASK_STATUSES = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
] as const;

export function ProjectTasks() {
  const { t } = useTranslation(['tasks', 'common']);
  const { taskId, attemptId } = useParams<{
    projectId: string;
    taskId?: string;
    attemptId?: string;
  }>();
  const navigate = useNavigate();
  const { enableScope, disableScope } = useHotkeysContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const isXL = useMediaQuery('(min-width: 1280px)');
  const isMobile = !isXL;

  const {
    projectId,
    isLoading: projectLoading,
    error: projectError,
  } = useProject();

  useEffect(() => {
    enableScope(Scope.KANBAN);

    return () => {
      disableScope(Scope.KANBAN);
    };
  }, [enableScope, disableScope]);

  const handleCreateTask = useCallback(() => {
    if (projectId) {
      openTaskForm({ projectId });
    }
  }, [projectId]);

  const handleEditTask = useCallback(
    (task: Task) => {
      if (projectId) {
        openTaskForm({ projectId, task });
      }
    },
    [projectId]
  );

  const handleDuplicateTask = useCallback(
    (task: Task) => {
      if (projectId) {
        openTaskForm({ projectId, initialTask: task });
      }
    },
    [projectId]
  );
  const { query: searchQuery, focusInput } = useSearch();

  const {
    tasks,
    tasksById,
    isLoading,
    error: streamError,
  } = useProjectTasks(projectId || '');

  const isPanelOpen = Boolean(taskId);
  const selectedTask = useMemo(
    () => (taskId ? (tasksById[taskId] ?? null) : null),
    [taskId, tasksById]
  );

  const isLatest = attemptId === 'latest';
  const { data: attempts = [], isLoading: isAttemptsLoading } = useTaskAttempts(
    taskId,
    {
      enabled: !!taskId && isLatest,
    }
  );

  const latestAttemptId = useMemo(() => {
    if (!attempts?.length) return undefined;
    return [...attempts].sort((a, b) => {
      const diff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    })[0].id;
  }, [attempts]);

  useEffect(() => {
    if (!projectId || !taskId) return;
    if (!isLatest) return;
    if (isAttemptsLoading) return;

    if (!latestAttemptId) {
      navigate(paths.task(projectId, taskId), { replace: true });
      return;
    }

    navigate(paths.attempt(projectId, taskId, latestAttemptId), {
      replace: true,
    });
  }, [
    projectId,
    taskId,
    isLatest,
    isAttemptsLoading,
    latestAttemptId,
    navigate,
  ]);

  const effectiveAttemptId = attemptId === 'latest' ? undefined : attemptId;
  const { data: attempt } = useTaskAttempt(effectiveAttemptId);
  const hasAttempt = Boolean(attemptId);

  const rawMode = searchParams.get('view') as LayoutMode;
  const mode: LayoutMode =
    rawMode === 'expand' || rawMode === 'preview' || rawMode === 'diffs'
      ? rawMode
      : null;

  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'logs') {
      const params = new URLSearchParams(searchParams);
      params.set('view', 'diffs');
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const setMode = useCallback(
    (newMode: LayoutMode) => {
      const params = new URLSearchParams(searchParams);
      if (newMode === null) {
        params.delete('view');
      } else {
        params.set('view', newMode);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleCreateNewTask = useCallback(() => {
    handleCreateTask();
  }, [handleCreateTask]);

  useKeyCreate(handleCreateNewTask, {
    scope: Scope.KANBAN,
    preventDefault: true,
  });

  useKeyFocusSearch(
    () => {
      focusInput();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyExit(
    () => {
      if (isPanelOpen) {
        handleClosePanel();
      } else {
        navigate('/projects');
      }
    },
    { scope: Scope.KANBAN }
  );

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) {
      return tasks;
    }
    const query = searchQuery.toLowerCase();
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(query) ||
        (task.description && task.description.toLowerCase().includes(query))
    );
  }, [tasks, searchQuery]);

  const groupedFilteredTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    TASK_STATUSES.forEach((status) => {
      groups[status] = [];
    });
    filteredTasks.forEach((task) => {
      const normalizedStatus = task.status.toLowerCase();
      if (groups[normalizedStatus]) {
        groups[normalizedStatus].push(task);
      } else {
        groups['todo'].push(task);
      }
    });
    return groups;
  }, [filteredTasks]);

  useKeyNavUp(
    () => {
      selectPreviousTask();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyNavDown(
    () => {
      selectNextTask();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyNavLeft(
    () => {
      selectPreviousColumn();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyNavRight(
    () => {
      selectNextColumn();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyOpenDetails(
    () => {
      if (selectedTask) {
        handleViewTaskDetails(selectedTask);
      }
    },
    { scope: Scope.KANBAN }
  );

  useKeyDeleteTask(
    () => {
      if (selectedTask) {
        handleDeleteTask(selectedTask.id);
      }
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  useKeyboardShortcut(
    {
      keys: 'w',
      callback: () => {
        if (hasAttempt) {
          setMode(mode === 'expand' ? null : 'expand');
        }
      },
      description: 'Toggle expand mode',
      scope: Scope.KANBAN,
    },
    { preventDefault: true }
  );

  useKeyboardShortcut(
    {
      keys: 'p',
      callback: () => {
        if (hasAttempt) {
          setMode(mode === 'preview' ? null : 'preview');
        }
      },
      description: 'Toggle preview mode',
      scope: Scope.KANBAN,
    },
    { preventDefault: true }
  );

  useKeyboardShortcut(
    {
      keys: 'l',
      callback: () => {
        if (hasAttempt) {
          setMode(mode === 'diffs' ? null : 'diffs');
        }
      },
      description: 'Toggle diffs mode',
      scope: Scope.KANBAN,
    },
    { preventDefault: true }
  );

  const handleClosePanel = useCallback(() => {
    if (projectId) {
      navigate(`/projects/${projectId}/tasks`, { replace: true });
    }
  }, [projectId, navigate]);

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      const task = tasksById[taskId];
      if (task) {
        NiceModal.show('delete-task-confirmation', {
          task,
          projectId: projectId!,
        })
          .then(() => {
            if (selectedTask?.id === taskId) {
              handleClosePanel();
            }
          })
          .catch(() => {});
      }
    },
    [tasksById, projectId, selectedTask, handleClosePanel]
  );

  const handleEditTaskCallback = useCallback(
    (task: Task) => {
      handleEditTask(task);
    },
    [handleEditTask]
  );

  const handleDuplicateTaskCallback = useCallback(
    (task: Task) => {
      handleDuplicateTask(task);
    },
    [handleDuplicateTask]
  );

  const handleViewTaskDetails = useCallback(
    (task: Task, attemptIdToShow?: string) => {
      if (attemptIdToShow) {
        navigate(paths.attempt(projectId!, task.id, attemptIdToShow));
      } else {
        navigate(`${paths.task(projectId!, task.id)}/attempts/latest`);
      }
    },
    [projectId, navigate]
  );

  const selectNextTask = useCallback(() => {
    if (selectedTask) {
      const tasksInStatus = groupedFilteredTasks[selectedTask.status] || [];
      const currentIndex = tasksInStatus.findIndex(
        (task) => task.id === selectedTask.id
      );
      if (currentIndex >= 0 && currentIndex < tasksInStatus.length - 1) {
        handleViewTaskDetails(tasksInStatus[currentIndex + 1]);
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = groupedFilteredTasks[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, groupedFilteredTasks, handleViewTaskDetails]);

  const selectPreviousTask = useCallback(() => {
    if (selectedTask) {
      const tasksInStatus = groupedFilteredTasks[selectedTask.status] || [];
      const currentIndex = tasksInStatus.findIndex(
        (task) => task.id === selectedTask.id
      );
      if (currentIndex > 0) {
        handleViewTaskDetails(tasksInStatus[currentIndex - 1]);
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = groupedFilteredTasks[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, groupedFilteredTasks, handleViewTaskDetails]);

  const selectNextColumn = useCallback(() => {
    if (selectedTask) {
      const currentIndex = TASK_STATUSES.findIndex(
        (status) => status === selectedTask.status
      );
      for (let i = currentIndex + 1; i < TASK_STATUSES.length; i++) {
        const tasks = groupedFilteredTasks[TASK_STATUSES[i]];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          return;
        }
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = groupedFilteredTasks[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, groupedFilteredTasks, handleViewTaskDetails]);

  const selectPreviousColumn = useCallback(() => {
    if (selectedTask) {
      const currentIndex = TASK_STATUSES.findIndex(
        (status) => status === selectedTask.status
      );
      for (let i = currentIndex - 1; i >= 0; i--) {
        const tasks = groupedFilteredTasks[TASK_STATUSES[i]];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          return;
        }
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = groupedFilteredTasks[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, groupedFilteredTasks, handleViewTaskDetails]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !active.data.current) return;

      const draggedTaskId = active.id as string;
      const newStatus = over.id as Task['status'];
      const task = tasksById[draggedTaskId];
      if (!task || task.status === newStatus) return;

      try {
        await tasksApi.update(draggedTaskId, {
          title: task.title,
          description: task.description,
          status: newStatus,
          parent_task_attempt: task.parent_task_attempt,
          image_ids: null,
        });
      } catch (err) {
        console.error('Failed to update task status:', err);
      }
    },
    [tasksById]
  );

  const isInitialTasksLoad = isLoading && tasks.length === 0;

  if (projectError) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('common:states.error')}
          </AlertTitle>
          <AlertDescription>
            {projectError.message || 'Failed to load project'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (projectLoading && isInitialTasksLoad) {
    return <Loader message={t('loading')} size={32} className="py-8" />;
  }

  const truncateTitle = (title: string | undefined, maxLength = 20) => {
    if (!title) return 'Task';
    if (title.length <= maxLength) return title;

    const truncated = title.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    return lastSpace > 0
      ? `${truncated.substring(0, lastSpace)}...`
      : `${truncated}...`;
  };

  const kanbanContent =
    tasks.length === 0 ? (
      <div className="max-w-7xl mx-auto mt-8">
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">{t('empty.noTasks')}</p>
            <Button className="mt-4" onClick={handleCreateNewTask}>
              <Plus className="h-4 w-4 mr-2" />
              {t('empty.createFirst')}
            </Button>
          </CardContent>
        </Card>
      </div>
    ) : filteredTasks.length === 0 ? (
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
      <div className="w-full h-full overflow-x-auto overflow-y-auto overscroll-x-contain touch-pan-y">
        <TaskKanbanBoard
          groupedTasks={groupedFilteredTasks}
          onDragEnd={handleDragEnd}
          onEditTask={handleEditTaskCallback}
          onDeleteTask={handleDeleteTask}
          onDuplicateTask={handleDuplicateTaskCallback}
          onViewTaskDetails={handleViewTaskDetails}
          selectedTask={selectedTask || undefined}
          onCreateTask={handleCreateNewTask}
        />
      </div>
    );

  const attemptContent = (
    <NewCard className="h-full min-h-0 flex flex-col bg-diagonal-lines bg-background border-0">
      <NewCardHeader
        className="shrink-0"
        actions={
          <AttemptHeaderActions
            mode={mode}
            onModeChange={setMode}
            onClose={() =>
              navigate(`/projects/${projectId}/tasks`, { replace: true })
            }
          />
        }
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>
                {truncateTitle(selectedTask?.title)}
              </BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {attempt?.branch || 'Task Attempt'}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </NewCardHeader>
      <TaskAttemptPanel attempt={attempt} task={selectedTask}>
        {({ logs, followUp }) => (
          <>
            <div className="flex-1 min-h-0 flex flex-col">{logs}</div>
            <div className="shrink-0">{followUp}</div>
          </>
        )}
      </TaskAttemptPanel>
    </NewCard>
  );

  const auxContent = (
    <div className="relative h-full w-full">
      <div
        aria-hidden={mode !== 'preview'}
        style={{ display: mode === 'preview' ? 'block' : 'none' }}
        className="h-full"
      >
        <PreviewPanel />
      </div>
      <div
        aria-hidden={mode !== 'diffs'}
        style={{ display: mode === 'diffs' ? 'block' : 'none' }}
        className="h-full"
      >
        <DiffsPanel />
      </div>
    </div>
  );

  return (
    <div className="min-h-full h-full flex flex-col">
      {streamError && (
        <Alert className="w-full z-30 xl:sticky xl:top-0">
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('common:states.reconnecting')}
          </AlertTitle>
          <AlertDescription>{streamError}</AlertDescription>
        </Alert>
      )}

      <div className="flex-1 min-h-0">
        <TasksLayout
          kanban={kanbanContent}
          attempt={attemptContent}
          aux={auxContent}
          hasAttempt={hasAttempt}
          mode={mode}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}
