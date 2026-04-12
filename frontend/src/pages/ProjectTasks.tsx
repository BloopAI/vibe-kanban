import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Plus } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi } from '@/lib/api';
import type { GitBranch, TaskAttempt, BranchStatus } from 'shared/types';
import { openTaskForm } from '@/lib/openTaskForm';
import { useSearch } from '@/contexts/SearchContext';
import { useProject } from '@/contexts/ProjectContext';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useBranchStatus, useAttemptExecution, useIsOrgAdmin } from '@/hooks';
import { projectsApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import {
  GitOperationsProvider,
  useGitOperationsError,
} from '@/contexts/GitOperationsContext';
import { TaskOptimisticProvider } from '@/contexts/TaskOptimisticContext';
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
  useKeyCycleViewBackward,
} from '@/keyboard';

import TaskKanbanBoard, {
  type KanbanColumnItem,
} from '@/components/tasks/TaskKanbanBoard';
import MobileKanbanBoard from '@/components/tasks/MobileKanbanBoard';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import {
  useProjectTasks,
  type UseProjectTasksOptions,
} from '@/hooks/useProjectTasks';
import { useColumnSortState } from '@/hooks/useColumnSortState';
import { sortTasksByStatus } from '@/lib/taskSorting';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { TasksLayout, type LayoutMode } from '@/components/layout/TasksLayout';
import { PreviewPanel } from '@/components/panels/PreviewPanel';
import { DiffsPanel } from '@/components/panels/DiffsPanel';
import { FilesPanel } from '@/components/files';
import { TerminalsPanel } from '@/components/terminal';
import { ProcessesPanel } from '@/components/panels/ProcessesPanel';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import TaskPanel from '@/components/panels/TaskPanel';
import { MobileConversationLayout } from '@/components/tasks/MobileConversationLayout';
import { NewCard, NewCardHeader } from '@/components/ui/new-card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AttemptHeaderActions } from '@/components/panels/AttemptHeaderActions';
import { TaskPanelHeaderActions } from '@/components/panels/TaskPanelHeaderActions';
import { MobileDetailHeader } from '@/components/panels/MobileDetailHeader';
import { MobileViewModeSheet } from '@/components/panels/MobileViewModeSheet';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';

import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

type Task = TaskWithAttemptStatus;

const TASK_STATUSES = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
] as const;

const normalizeStatus = (status: string): TaskStatus =>
  status.toLowerCase() as TaskStatus;

function GitErrorBanner() {
  const { error: gitError } = useGitOperationsError();

  if (!gitError) return null;

  return (
    <div className="mx-4 mt-4 p-3 border border-destructive rounded">
      <div className="text-destructive text-sm">{gitError}</div>
    </div>
  );
}

function DiffsPanelContainer({
  attempt,
  selectedTask,
  projectId,
  branchStatus,
  branches,
}: {
  attempt: TaskAttempt | null;
  selectedTask: TaskWithAttemptStatus | null;
  projectId: string;
  branchStatus: BranchStatus | null;
  branches: GitBranch[];
}) {
  const { isAttemptRunning } = useAttemptExecution(attempt?.id);

  return (
    <DiffsPanel
      selectedAttempt={attempt}
      task={selectedTask}
      gitOps={
        attempt && selectedTask
          ? {
              task: selectedTask,
              projectId,
              branchStatus: branchStatus ?? null,
              branches,
              isAttemptRunning,
              selectedBranch: branchStatus?.target_branch_name ?? null,
            }
          : undefined
      }
    />
  );
}

export function ProjectTasks() {
  const { t } = useTranslation(['tasks', 'common']);
  const { taskId, attemptId } = useParams<{
    projectId: string;
    taskId?: string;
    attemptId?: string;
  }>();
  const navigate = useNavigate();
  const { enableScope, disableScope, activeScopes } = useHotkeysContext();
  const [searchParams, setSearchParams] = useSearchParams();
  // Tablet breakpoint: 768px+ (md) - gets desktop header with toggle group
  const isMD = useMediaQuery('(min-width: 768px)');
  // Mobile is < 768px for UI purposes (header, panels, bottom sheet)
  const isMobile = !isMD;
  // Use sm breakpoint (640px) for mobile Kanban swipe view only
  const isMobileKanban = useIsMobile();
  const [isMobileViewModeOpen, setIsMobileViewModeOpen] = useState(false);
  const isOrgAdmin = useIsOrgAdmin();

  const {
    projectId,
    project,
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
      openTaskForm({ mode: 'create', projectId });
    }
  }, [projectId]);
  const { query: searchQuery, focusInput } = useSearch();

  // Sort state for kanban columns
  const { sortDirections, toggleDirection } = useColumnSortState();

  // Filter state from URL params
  const showArchived = searchParams.get('archived') === 'on';
  // Use REST API polling for remote projects OR swarm-linked projects
  // WebSocket only returns local tasks, but swarm-linked projects need merged local+hive tasks
  const isSwarmLinked = !!project?.remote_project_id;
  const useRestApi = project?.is_remote || isSwarmLinked;

  const projectTasksOptions: UseProjectTasksOptions = useMemo(
    () => ({
      includeArchived: showArchived,
      sortDirections,
      // For remote or swarm-linked projects, use REST API polling instead of WebSocket
      // since WebSocket only returns local tasks
      isRemote: useRestApi,
    }),
    [showArchived, sortDirections, useRestApi]
  );

  const {
    tasks,
    tasksById,
    isLoading,
    error: streamError,
    addTaskOptimistically,
    updateTaskStatusOptimistically,
    updateTaskArchivedOptimistically,
  } = useProjectTasks(projectId || '', projectTasksOptions);

  const selectedTask = useMemo(
    () => (taskId ? (tasksById[taskId] ?? null) : null),
    [taskId, tasksById]
  );

  const isTaskPanelOpen = Boolean(taskId && selectedTask);
  const isPanelOpen = isTaskPanelOpen;

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

  const navigateWithSearch = useCallback(
    (pathname: string, options?: { replace?: boolean }) => {
      const search = searchParams.toString();
      navigate({ pathname, search: search ? `?${search}` : '' }, options);
    },
    [navigate, searchParams]
  );

  useEffect(() => {
    if (!projectId || !taskId) return;
    if (!isLatest) return;
    if (isAttemptsLoading) return;

    if (!latestAttemptId) {
      navigateWithSearch(paths.task(projectId, taskId), { replace: true });
      return;
    }

    navigateWithSearch(paths.attempt(projectId, taskId, latestAttemptId), {
      replace: true,
    });
  }, [
    projectId,
    taskId,
    isLatest,
    isAttemptsLoading,
    latestAttemptId,
    navigate,
    navigateWithSearch,
  ]);

  useEffect(() => {
    if (!projectId || !taskId || isLoading) return;
    if (selectedTask === null) {
      navigate(`/projects/${projectId}/tasks`, { replace: true });
    }
  }, [projectId, taskId, isLoading, selectedTask, navigate]);

  const effectiveAttemptId = attemptId === 'latest' ? undefined : attemptId;
  const isTaskView = !!taskId && !effectiveAttemptId;
  const { data: attempt } = useTaskAttempt(effectiveAttemptId);

  const { data: branchStatus } = useBranchStatus(attempt?.id);
  const [branches, setBranches] = useState<GitBranch[]>([]);

  useEffect(() => {
    if (!projectId) return;
    projectsApi
      .getBranches(projectId)
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [projectId]);

  const rawMode = searchParams.get('view') as LayoutMode;
  const mode: LayoutMode =
    rawMode === 'preview' ||
    rawMode === 'diffs' ||
    rawMode === 'files' ||
    rawMode === 'terminal' ||
    rawMode === 'processes'
      ? rawMode
      : null;

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

  useKeyCreate(handleCreateTask, {
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

  const hasSearch = Boolean(searchQuery.trim());
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const kanbanColumns = useMemo(() => {
    const columns: Record<TaskStatus, KanbanColumnItem[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    const matchesSearch = (
      title: string,
      description?: string | null
    ): boolean => {
      if (!hasSearch) return true;
      const lowerTitle = title.toLowerCase();
      const lowerDescription = description?.toLowerCase() ?? '';
      return (
        lowerTitle.includes(normalizedSearch) ||
        lowerDescription.includes(normalizedSearch)
      );
    };

    // Archive filter: when showArchived=true, show ONLY archived tasks
    // when showArchived=false, show ONLY non-archived tasks
    const matchesArchiveFilter = (
      archivedAt: string | Date | null
    ): boolean => {
      const isArchived = archivedAt !== null;
      return showArchived ? isArchived : !isArchived;
    };

    tasks.forEach((task) => {
      const statusKey = normalizeStatus(task.status);

      if (!matchesSearch(task.title, task.description)) {
        return;
      }

      // Apply archive filter
      if (!matchesArchiveFilter(task.archived_at)) {
        return;
      }

      columns[statusKey].push({
        type: 'task',
        task,
      });
    });

    // Apply status-aware sorting using centralized utility
    // Extract tasks from columns, sort them, then re-wrap
    TASK_STATUSES.forEach((status) => {
      const tasksInColumn = columns[status].map((item) => item.task);
      const sortedTasks = sortTasksByStatus(
        tasksInColumn,
        sortDirections[status]
      );
      columns[status] = sortedTasks.map((task) => ({ type: 'task', task }));
    });

    return columns;
  }, [hasSearch, normalizedSearch, tasks, showArchived, sortDirections]);

  const visibleTasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    TASK_STATUSES.forEach((status) => {
      map[status] = kanbanColumns[status]
        .filter((item) => item.type === 'task')
        .map((item) => item.task);
    });

    return map;
  }, [kanbanColumns]);

  const hasVisibleLocalTasks = useMemo(
    () =>
      Object.values(visibleTasksByStatus).some(
        (items) => items && items.length > 0
      ),
    [visibleTasksByStatus]
  );

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

  /**
   * Cycle the attempt area view.
   * - When panel is closed: opens task details (if a task is selected)
   * - When panel is open: cycles among [attempt, preview, diffs, files]
   */
  const cycleView = useCallback(
    (direction: 'forward' | 'backward' = 'forward') => {
      const order: LayoutMode[] = [null, 'preview', 'diffs', 'files'];
      const idx = order.indexOf(mode);
      const next =
        direction === 'forward'
          ? order[(idx + 1) % order.length]
          : order[(idx - 1 + order.length) % order.length];
      setMode(next);
    },
    [mode, setMode]
  );

  const cycleViewForward = useCallback(() => cycleView('forward'), [cycleView]);
  const cycleViewBackward = useCallback(
    () => cycleView('backward'),
    [cycleView]
  );

  // meta/ctrl+enter → open details or cycle forward
  const isFollowUpReadyActive = activeScopes.includes(Scope.FOLLOW_UP_READY);

  useKeyOpenDetails(
    () => {
      if (isPanelOpen) {
        cycleViewForward();
      } else if (selectedTask) {
        handleViewTaskDetails(selectedTask);
      }
    },
    { scope: Scope.KANBAN, when: () => !isFollowUpReadyActive }
  );

  // meta/ctrl+shift+enter → cycle backward
  useKeyCycleViewBackward(
    () => {
      if (isPanelOpen) {
        cycleViewBackward();
      }
    },
    { scope: Scope.KANBAN, preventDefault: true }
  );

  useKeyDeleteTask(
    () => {
      // Note: Delete is now handled by TaskActionsDropdown
      // This keyboard shortcut could trigger the dropdown action if needed
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true,
    }
  );

  const handleClosePanel = useCallback(() => {
    if (projectId) {
      navigate(`/projects/${projectId}/tasks`, { replace: true });
    }
  }, [projectId, navigate]);

  const handleViewTaskDetails = useCallback(
    (task: Task, attemptIdToShow?: string) => {
      if (!projectId) return;

      if (attemptIdToShow) {
        navigateWithSearch(paths.attempt(projectId, task.id, attemptIdToShow));
      } else {
        navigateWithSearch(`${paths.task(projectId, task.id)}/attempts/latest`);
      }
    },
    [projectId, navigateWithSearch]
  );

  const selectNextTask = useCallback(() => {
    if (selectedTask) {
      const statusKey = normalizeStatus(selectedTask.status);
      const tasksInStatus = visibleTasksByStatus[statusKey] || [];
      const currentIndex = tasksInStatus.findIndex(
        (task) => task.id === selectedTask.id
      );
      if (currentIndex >= 0 && currentIndex < tasksInStatus.length - 1) {
        handleViewTaskDetails(tasksInStatus[currentIndex + 1]);
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = visibleTasksByStatus[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, visibleTasksByStatus, handleViewTaskDetails]);

  const selectPreviousTask = useCallback(() => {
    if (selectedTask) {
      const statusKey = normalizeStatus(selectedTask.status);
      const tasksInStatus = visibleTasksByStatus[statusKey] || [];
      const currentIndex = tasksInStatus.findIndex(
        (task) => task.id === selectedTask.id
      );
      if (currentIndex > 0) {
        handleViewTaskDetails(tasksInStatus[currentIndex - 1]);
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = visibleTasksByStatus[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, visibleTasksByStatus, handleViewTaskDetails]);

  const selectNextColumn = useCallback(() => {
    if (selectedTask) {
      const currentStatus = normalizeStatus(selectedTask.status);
      const currentIndex = TASK_STATUSES.findIndex(
        (status) => status === currentStatus
      );
      for (let i = currentIndex + 1; i < TASK_STATUSES.length; i++) {
        const tasks = visibleTasksByStatus[TASK_STATUSES[i]];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          return;
        }
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = visibleTasksByStatus[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, visibleTasksByStatus, handleViewTaskDetails]);

  const selectPreviousColumn = useCallback(() => {
    if (selectedTask) {
      const currentStatus = normalizeStatus(selectedTask.status);
      const currentIndex = TASK_STATUSES.findIndex(
        (status) => status === currentStatus
      );
      for (let i = currentIndex - 1; i >= 0; i--) {
        const tasks = visibleTasksByStatus[TASK_STATUSES[i]];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          return;
        }
      }
    } else {
      for (const status of TASK_STATUSES) {
        const tasks = visibleTasksByStatus[status];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          break;
        }
      }
    }
  }, [selectedTask, visibleTasksByStatus, handleViewTaskDetails]);

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
          parent_task_id: task.parent_task_id,
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
            <Button className="mt-4" onClick={handleCreateTask}>
              <Plus className="h-4 w-4 mr-2" />
              {t('empty.createFirst')}
            </Button>
          </CardContent>
        </Card>
      </div>
    ) : !hasVisibleLocalTasks ? (
      <div className="max-w-7xl mx-auto mt-8">
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">
              {t('empty.noSearchResults')}
            </p>
          </CardContent>
        </Card>
      </div>
    ) : isMobileKanban ? (
      <MobileKanbanBoard
        columns={kanbanColumns}
        onViewTaskDetails={handleViewTaskDetails}
        selectedTaskId={selectedTask?.id}
        projectId={projectId!}
        className="h-full"
        sortDirections={sortDirections}
        onSortToggle={toggleDirection}
      />
    ) : (
      <div className="w-full h-full overflow-x-auto overflow-y-auto overscroll-x-contain">
        <TaskKanbanBoard
          columns={kanbanColumns}
          onDragEnd={handleDragEnd}
          onViewTaskDetails={handleViewTaskDetails}
          selectedTaskId={selectedTask?.id}
          onCreateTask={handleCreateTask}
          projectId={projectId!}
          sortDirections={sortDirections}
          onSortToggle={toggleDirection}
        />
      </div>
    );

  // Mobile header with back button, view mode sheet, and actions dropdown
  const mobileHeader = selectedTask ? (
    <>
      <MobileDetailHeader
        title={truncateTitle(selectedTask?.title, 30) || 'Task'}
        subtitle={!isTaskView ? attempt?.branch : undefined}
        onBack={handleClosePanel}
        mode={mode}
        onViewModePress={
          !isTaskView ? () => setIsMobileViewModeOpen(true) : undefined
        }
        actions={
          <ActionsDropdown
            task={selectedTask}
            attempt={attempt}
            isOrgAdmin={isOrgAdmin}
          />
        }
      />
      {!isTaskView && (
        <MobileViewModeSheet
          open={isMobileViewModeOpen}
          onOpenChange={setIsMobileViewModeOpen}
          mode={mode}
          onModeChange={setMode}
        />
      )}
    </>
  ) : null;

  // Desktop header with breadcrumb navigation and full actions
  const desktopHeader = selectedTask ? (
    <NewCardHeader
      className="shrink-0"
      actions={
        isTaskView ? (
          <TaskPanelHeaderActions
            task={selectedTask}
            onClose={() =>
              navigate(`/projects/${projectId}/tasks`, { replace: true })
            }
          />
        ) : (
          <AttemptHeaderActions
            mode={mode}
            onModeChange={setMode}
            task={selectedTask}
            attempt={attempt ?? null}
            onClose={() =>
              navigate(`/projects/${projectId}/tasks`, { replace: true })
            }
            isMobile={isMobile}
          />
        )
      }
    >
      <div className="mx-auto w-full">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {isTaskView ? (
                <BreadcrumbPage>
                  {truncateTitle(selectedTask?.title)}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  className="cursor-pointer hover:underline"
                  onClick={() =>
                    navigateWithSearch(paths.task(projectId!, taskId!))
                  }
                >
                  {truncateTitle(selectedTask?.title)}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!isTaskView && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {attempt?.branch || 'Task Attempt'}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </NewCardHeader>
  ) : null;

  // Choose header based on viewport
  const rightHeader = isMobile ? mobileHeader : desktopHeader;

  const attemptContent = selectedTask ? (
    <NewCard className="h-full min-h-0 flex flex-col bg-diagonal-lines bg-muted border-0">
      {isTaskView ? (
        <TaskPanel task={selectedTask} />
      ) : (
        <TaskAttemptPanel
          attempt={attempt}
          task={selectedTask}
          onNavigateToTask={(taskId) => {
            if (projectId) {
              navigateWithSearch(
                `${paths.task(projectId, taskId)}/attempts/latest`
              );
            }
          }}
          tasksById={tasksById}
        >
          {({ logs, followUp, relationships, variables }) => (
            <>
              <GitErrorBanner />
              <MobileConversationLayout
                task={selectedTask}
                logs={logs}
                followUp={followUp}
                relationships={relationships}
                variables={variables}
                isMobile={isMobile}
                selectedAttemptId={attempt?.id}
              />
            </>
          )}
        </TaskAttemptPanel>
      )}
    </NewCard>
  ) : null;

  const auxContent =
    selectedTask && attempt ? (
      <div className="relative h-full w-full">
        {mode === 'preview' && <PreviewPanel />}
        {mode === 'diffs' && (
          <DiffsPanelContainer
            attempt={attempt}
            selectedTask={selectedTask}
            projectId={projectId!}
            branchStatus={branchStatus ?? null}
            branches={branches}
          />
        )}
        {mode === 'files' && (
          <FilesPanel
            attemptId={attempt.id}
            projectId={projectId!}
            compact={isMobile}
          />
        )}
        {mode === 'terminal' && (
          <TerminalsPanel
            attemptId={attempt.id}
            onClose={() => setMode(null)}
          />
        )}
        {mode === 'processes' && <ProcessesPanel attemptId={attempt.id} />}
      </div>
    ) : (
      <div className="relative h-full w-full" />
    );

  const effectiveMode: LayoutMode = mode;

  const attemptArea = (
    <GitOperationsProvider attemptId={attempt?.id}>
      <ClickedElementsProvider attempt={attempt}>
        <ReviewProvider attemptId={attempt?.id}>
          <ExecutionProcessesProvider attemptId={attempt?.id}>
            <TasksLayout
              kanban={kanbanContent}
              attempt={attemptContent}
              aux={auxContent}
              isPanelOpen={isPanelOpen}
              mode={effectiveMode}
              isMobile={isMobile}
              rightHeader={rightHeader}
              onSwipeClose={handleClosePanel}
            />
          </ExecutionProcessesProvider>
        </ReviewProvider>
      </ClickedElementsProvider>
    </GitOperationsProvider>
  );

  return (
    <TaskOptimisticProvider
      addTaskOptimistically={addTaskOptimistically}
      updateTaskStatusOptimistically={updateTaskStatusOptimistically}
      updateTaskArchivedOptimistically={updateTaskArchivedOptimistically}
    >
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

        <div className="flex-1 min-h-0">{attemptArea}</div>
      </div>
    </TaskOptimisticProvider>
  );
}
