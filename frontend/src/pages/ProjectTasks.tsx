import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Plus } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi, attemptsApi, sessionsApi } from '@/lib/api';
import { useAutoReviewSettings } from '@/hooks/useAutoReviewSettings';
import type { RepoBranchStatus, Workspace } from 'shared/types';
import { openTaskForm } from '@/lib/openTaskForm';
import { FeatureShowcaseDialog } from '@/components/dialogs/global/FeatureShowcaseDialog';
import { BetaWorkspacesDialog } from '@/components/dialogs/global/BetaWorkspacesDialog';
import { showcases } from '@/config/showcases';
import { useUserSystem } from '@/components/ConfigProvider';
import { useWorkspaceCount } from '@/hooks/useWorkspaceCount';
import { usePostHog } from 'posthog-js/react';

import { useSearch } from '@/contexts/SearchContext';
import { useProject } from '@/contexts/ProjectContext';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useBranchStatus, useAttemptExecution } from '@/hooks';
import { paths } from '@/lib/paths';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import {
  GitOperationsProvider,
  useGitOperationsError,
} from '@/contexts/GitOperationsContext';
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
  type KanbanColumns,
} from '@/components/tasks/TaskKanbanBoard';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { TasksLayout, type LayoutMode } from '@/components/layout/TasksLayout';
import { PreviewPanel } from '@/components/panels/PreviewPanel';
import { DiffsPanel } from '@/components/panels/DiffsPanel';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import TaskPanel from '@/components/panels/TaskPanel';
import TodoPanel from '@/components/tasks/TodoPanel';
import { PmDocsPanel } from '@/components/panels/PmDocsPanel';
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
  branchStatus,
  branchStatusError,
}: {
  attempt: Workspace | null;
  selectedTask: TaskWithAttemptStatus | null;
  branchStatus: RepoBranchStatus[] | null;
  branchStatusError?: Error | null;
}) {
  const { isAttemptRunning } = useAttemptExecution(attempt?.id);

  return (
    <DiffsPanel
      key={attempt?.id}
      selectedAttempt={attempt}
      gitOps={
        attempt && selectedTask
          ? {
              task: selectedTask,
              branchStatus: branchStatus ?? null,
              branchStatusError,
              isAttemptRunning,
              selectedBranch: branchStatus?.[0]?.target_branch_name ?? null,
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
  const isXL = useMediaQuery('(min-width: 1280px)');
  const isMobile = !isXL;
  const posthog = usePostHog();

  const {
    projectId,
    project,
    isLoading: projectLoading,
    error: projectError,
  } = useProject();

  // Auto-review settings for the project
  const { settings: autoReviewSettings } = useAutoReviewSettings(projectId);

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

  const {
    tasks,
    tasksById,
    isLoading,
    error: streamError,
  } = useProjectTasks(projectId || '');

  const selectedTask = useMemo(
    () => (taskId ? (tasksById[taskId] ?? null) : null),
    [taskId, tasksById]
  );

  const isPanelOpen = Boolean(taskId && selectedTask);

  const { config, updateAndSaveConfig, loading } = useUserSystem();

  const isLoaded = !loading;
  const showcaseId = showcases.taskPanel.id;
  const seenFeatures = useMemo(
    () => config?.showcases?.seen_features ?? [],
    [config?.showcases?.seen_features]
  );
  const seen = isLoaded && seenFeatures.includes(showcaseId);

  useEffect(() => {
    if (!isLoaded || !isPanelOpen || seen) return;

    FeatureShowcaseDialog.show({ config: showcases.taskPanel }).finally(() => {
      FeatureShowcaseDialog.hide();
      if (seenFeatures.includes(showcaseId)) return;
      void updateAndSaveConfig({
        showcases: { seen_features: [...seenFeatures, showcaseId] },
      });
    });
  }, [
    isLoaded,
    isPanelOpen,
    seen,
    showcaseId,
    updateAndSaveConfig,
    seenFeatures,
  ]);

  // Beta workspaces invitation - only fetch count if invitation not yet sent
  const shouldCheckBetaInvitation =
    isLoaded && !config?.beta_workspaces_invitation_sent;
  const { data: workspaceCount } = useWorkspaceCount({
    enabled: shouldCheckBetaInvitation,
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (config?.beta_workspaces_invitation_sent) return;
    if (workspaceCount === undefined || workspaceCount <= 5) return;

    BetaWorkspacesDialog.show().then((joinBeta) => {
      BetaWorkspacesDialog.hide();
      void updateAndSaveConfig({
        beta_workspaces_invitation_sent: true,
        beta_workspaces: joinBeta === true,
      });
      if (joinBeta === true) {
        navigate('/workspaces');
      }
    });
  }, [
    isLoaded,
    config?.beta_workspaces_invitation_sent,
    workspaceCount,
    updateAndSaveConfig,
    navigate,
  ]);

  // Redirect beta users from old attempt URLs to the new workspaces UI
  useEffect(() => {
    if (!isLoaded) return;
    if (!config?.beta_workspaces) return;
    if (!attemptId || attemptId === 'latest') return;

    navigate(`/workspaces/${attemptId}`, { replace: true });
  }, [isLoaded, config?.beta_workspaces, attemptId, navigate]);

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
  const { data: attempt } = useTaskAttemptWithSession(effectiveAttemptId);

  const { data: branchStatus, error: branchStatusError } = useBranchStatus(
    attempt?.id
  );

  const rawMode = searchParams.get('view') as LayoutMode;
  const mode: LayoutMode =
    rawMode === 'preview' || rawMode === 'diffs' ? rawMode : null;

  // TODO: Remove this redirect after v0.1.0 (legacy URL support for bookmarked links)
  // Migrates old `view=logs` to `view=diffs`
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

  const hasSearch = Boolean(searchQuery.trim());
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const kanbanColumns = useMemo(() => {
    const columns: KanbanColumns = {
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

    tasks.forEach((task) => {
      const statusKey = normalizeStatus(task.status);

      if (!matchesSearch(task.title, task.description)) {
        return;
      }

      columns[statusKey].push(task);
    });

    TASK_STATUSES.forEach((status) => {
      // Sort by position first, then by created_at (newer first) for tasks with same position
      columns[status].sort((a, b) => {
        if (a.position !== b.position) {
          return a.position - b.position;
        }
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    });

    return columns;
  }, [hasSearch, normalizedSearch, tasks]);

  const visibleTasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    TASK_STATUSES.forEach((status) => {
      map[status] = kanbanColumns[status];
    });

    return map;
  }, [kanbanColumns]);

  const hasVisibleTasks = useMemo(
    () =>
      Object.values(visibleTasksByStatus).some(
        (items) => items && items.length > 0
      ),
    [visibleTasksByStatus]
  );

  // Calculate project progress (completed tasks / total tasks)
  const projectProgress = useMemo(() => {
    if (tasks.length === 0) return { total: 0, done: 0, percent: 0 };
    const done = tasks.filter((t) => t.status === 'done').length;
    const percent = Math.round((done / tasks.length) * 100);
    return { total: tasks.length, done, percent };
  }, [tasks]);

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
   * - When panel is open: cycles among [attempt, preview, diffs]
   */
  const cycleView = useCallback(
    (direction: 'forward' | 'backward' = 'forward') => {
      const order: LayoutMode[] = [null, 'preview', 'diffs'];
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
        // Track keyboard shortcut before cycling view
        const order: LayoutMode[] = [null, 'preview', 'diffs'];
        const idx = order.indexOf(mode);
        const next = order[(idx + 1) % order.length];

        if (next === 'preview') {
          posthog?.capture('preview_navigated', {
            trigger: 'keyboard',
            direction: 'forward',
            timestamp: new Date().toISOString(),
            source: 'frontend',
          });
        } else if (next === 'diffs') {
          posthog?.capture('diffs_navigated', {
            trigger: 'keyboard',
            direction: 'forward',
            timestamp: new Date().toISOString(),
            source: 'frontend',
          });
        }

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
        // Track keyboard shortcut before cycling view
        const order: LayoutMode[] = [null, 'preview', 'diffs'];
        const idx = order.indexOf(mode);
        const next = order[(idx - 1 + order.length) % order.length];

        if (next === 'preview') {
          posthog?.capture('preview_navigated', {
            trigger: 'keyboard',
            direction: 'backward',
            timestamp: new Date().toISOString(),
            source: 'frontend',
          });
        } else if (next === 'diffs') {
          posthog?.capture('diffs_navigated', {
            trigger: 'keyboard',
            direction: 'backward',
            timestamp: new Date().toISOString(),
            source: 'frontend',
          });
        }

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

      // If beta_workspaces is enabled, always navigate to task view (not attempt)
      if (config?.beta_workspaces) {
        navigateWithSearch(paths.task(projectId, task.id));
        return;
      }

      if (attemptIdToShow) {
        navigateWithSearch(paths.attempt(projectId, task.id, attemptIdToShow));
      } else {
        navigateWithSearch(`${paths.task(projectId, task.id)}/attempts/latest`);
      }
    },
    [projectId, navigateWithSearch, config?.beta_workspaces]
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

  // Helper function to trigger auto-review when task moves to inreview
  const triggerAutoReview = useCallback(
    async (taskId: string) => {
      if (!autoReviewSettings.enabled) return;
      if (!autoReviewSettings.executorProfileId) {
        console.warn('Auto-review enabled but no executor profile configured');
        return;
      }

      try {
        // Get latest workspace for the task
        const workspaces = await attemptsApi.getAll(taskId);
        if (!workspaces || workspaces.length === 0) {
          console.warn('No workspace found for task, cannot start auto-review');
          return;
        }

        // Sort by created_at to get the latest workspace
        const latestWorkspace = [...workspaces].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        // Create a new session or find existing one
        const session = await sessionsApi.create({
          workspace_id: latestWorkspace.id,
          executor: autoReviewSettings.executorProfileId.executor,
        });

        // Build the review prompt
        const promptParts: string[] = [];

        if (autoReviewSettings.includePmReview && project?.pm_docs) {
          promptParts.push(
            'Please review this task against the project specifications and requirements defined in the PM docs.'
          );
        }

        if (autoReviewSettings.includeCodeReview) {
          promptParts.push(
            'Also perform a code review checking for code quality, best practices, potential bugs, and security issues.'
          );
        }

        if (autoReviewSettings.additionalPrompt) {
          promptParts.push(autoReviewSettings.additionalPrompt);
        }

        if (promptParts.length === 0) {
          promptParts.push('Please review the changes in this task.');
        }

        // Start the review
        await sessionsApi.startReview(session.id, {
          executor_profile_id: autoReviewSettings.executorProfileId,
          additional_prompt: promptParts.join('\n\n'),
          use_all_workspace_commits: true,
        });

        console.log('Auto-review started for task:', taskId);
      } catch (err) {
        console.error('Failed to start auto-review:', err);
      }
    },
    [autoReviewSettings, project?.pm_docs]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !active.data.current) return;

      const draggedTaskId = active.id as string;
      const overId = over.id as string;
      const task = tasksById[draggedTaskId];
      if (!task) return;

      // Check if dropped on another task (reordering) or on a column (status change)
      const overTask = tasksById[overId];
      const isStatusChange = TASK_STATUSES.includes(overId as TaskStatus);

      if (isStatusChange) {
        // Dropped on a column - change status
        const newStatus = overId as Task['status'];
        if (task.status === newStatus) return;

        try {
          await tasksApi.update(draggedTaskId, {
            title: task.title,
            description: task.description,
            status: newStatus,
            priority: null,
            position: null,
            parent_workspace_id: task.parent_workspace_id,
            image_ids: null,
            label_ids: null,
          });

          // Trigger auto-review if task moved to inreview
          if (newStatus === 'inreview') {
            void triggerAutoReview(draggedTaskId);
          }
        } catch (err) {
          console.error('Failed to update task status:', err);
        }
      } else if (overTask) {
        // Dropped on another task - reorder within the column or move to new column
        const activeData = active.data.current as { parent?: string };
        const overData = over.data.current as { parent?: string };

        const sourceStatus = activeData?.parent || task.status;
        const targetStatus = overData?.parent || overTask.status;

        // Get tasks in target column
        const targetTasks = kanbanColumns[targetStatus as TaskStatus] || [];
        const overIndex = targetTasks.findIndex((t) => t.id === overId);

        // Calculate new position
        let newPosition: number;
        if (overIndex === 0) {
          // Dropped at the top
          newPosition = (targetTasks[0]?.position ?? 0) - 1000;
        } else if (overIndex === targetTasks.length - 1) {
          // Dropped at the bottom
          newPosition =
            (targetTasks[targetTasks.length - 1]?.position ?? 0) + 1000;
        } else {
          // Dropped in the middle - calculate average position
          const prevPos = targetTasks[overIndex - 1]?.position ?? 0;
          const nextPos = targetTasks[overIndex]?.position ?? prevPos + 2000;
          newPosition = Math.floor((prevPos + nextPos) / 2);
        }

        const statusChanged = sourceStatus !== targetStatus;

        try {
          await tasksApi.update(draggedTaskId, {
            title: task.title,
            description: task.description,
            status: statusChanged ? (targetStatus as TaskStatus) : null,
            priority: null,
            position: newPosition,
            parent_workspace_id: task.parent_workspace_id,
            image_ids: null,
            label_ids: null,
          });

          // Trigger auto-review if task moved to inreview
          if (statusChanged && targetStatus === 'inreview') {
            void triggerAutoReview(draggedTaskId);
          }
        } catch (err) {
          console.error('Failed to update task position:', err);
        }
      }
    },
    [tasksById, kanbanColumns, triggerAutoReview]
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

  // Main content area - always shows PM Chat sidebar
  const mainContent =
    tasks.length === 0 ? (
      // Empty state - no tasks
      <div className="flex-1 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">{t('empty.noTasks')}</p>
            <Button className="mt-4" onClick={handleCreateNewTask}>
              <Plus className="h-4 w-4 mr-2" />
              {t('empty.createFirst')}
            </Button>
          </CardContent>
        </Card>
      </div>
    ) : !hasVisibleTasks ? (
      // No search results
      <div className="flex-1 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">
              {t('empty.noSearchResults')}
            </p>
          </CardContent>
        </Card>
      </div>
    ) : (
      // Normal kanban board with progress
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Project Progress Bar */}
        {projectProgress.total > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t('progress', {
                done: projectProgress.done,
                total: projectProgress.total,
              })}
            </span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-xs">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${projectProgress.percent}%` }}
              />
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              {projectProgress.percent}%
            </span>
          </div>
        )}
        <div className="flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain">
          <TaskKanbanBoard
            columns={kanbanColumns}
            onDragEnd={handleDragEnd}
            onViewTaskDetails={handleViewTaskDetails}
            selectedTaskId={selectedTask?.id}
            onCreateTask={handleCreateNewTask}
            projectId={projectId!}
          />
        </div>
      </div>
    );

  // Kanban content always includes PM Chat sidebar
  const kanbanContent = (
    <div className="w-full h-full flex overflow-hidden">
      {/* PM Docs Sidebar - always visible */}
      <PmDocsPanel projectId={projectId} />

      {/* Main Area */}
      {mainContent}
    </div>
  );

  const rightHeader = selectedTask ? (
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

  const attemptContent = selectedTask ? (
    <NewCard className="h-full min-h-0 flex flex-col bg-muted border-0">
      {isTaskView ? (
        <TaskPanel task={selectedTask} />
      ) : (
        <TaskAttemptPanel attempt={attempt} task={selectedTask}>
          {({ logs, followUp }) => (
            <>
              <GitErrorBanner />
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 flex flex-col">{logs}</div>

                <div className="shrink-0 border-t">
                  <div className="mx-auto w-full max-w-[50rem]">
                    <TodoPanel />
                  </div>
                </div>

                <div className="min-h-0 max-h-[50%] border-t overflow-hidden bg-background">
                  <div className="mx-auto w-full max-w-[50rem] h-full min-h-0">
                    {followUp}
                  </div>
                </div>
              </div>
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
            branchStatus={branchStatus ?? null}
            branchStatusError={branchStatusError}
          />
        )}
      </div>
    ) : (
      <div className="relative h-full w-full" />
    );

  const attemptArea = (
    <GitOperationsProvider attemptId={attempt?.id}>
      <ClickedElementsProvider attempt={attempt}>
        <ReviewProvider attemptId={attempt?.id}>
          <ExecutionProcessesProvider
            attemptId={attempt?.id}
            sessionId={attempt?.session?.id}
          >
            <TasksLayout
              kanban={kanbanContent}
              attempt={attemptContent}
              aux={auxContent}
              isPanelOpen={isPanelOpen}
              mode={mode}
              isMobile={isMobile}
              rightHeader={rightHeader}
            />
          </ExecutionProcessesProvider>
        </ReviewProvider>
      </ClickedElementsProvider>
    </GitOperationsProvider>
  );

  return (
    <div className="h-full flex flex-col">
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
  );
}
