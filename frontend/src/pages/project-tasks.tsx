import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Plus } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { tasksApi } from '@/lib/api';
import { openTaskForm } from '@/lib/openTaskForm';

import { useSearch } from '@/contexts/search-context';
import { useProject } from '@/contexts/project-context';
import { useTaskViewManager } from '@/hooks/useTaskViewManager';
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
  useKeyToggleFullscreen,
  useKeyDeleteTask,
} from '@/keyboard';

import {
  getKanbanSectionClasses,
  getMainContainerClasses,
} from '@/lib/responsive-config';

import TaskKanbanBoard from '@/components/tasks/TaskKanbanBoard';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import NiceModal from '@ebay/nice-modal-react';
import { useHotkeysContext } from 'react-hotkeys-hook';
import KanbanSidebar from '@/components/panels/KanbanSidebar';

type Task = TaskWithAttemptStatus;

export function ProjectTasks() {
  const { t } = useTranslation(['tasks', 'common']);
  const { taskId } = useParams<{
    projectId: string;
    taskId?: string;
  }>();
  const navigate = useNavigate();
  const { enableScope, disableScope } = useHotkeysContext();

  // Use project context for project data
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

  // Helper functions to open task forms
  const handleCreateTask = () => {
    if (projectId) {
      openTaskForm({ projectId });
    }
  };

  const handleEditTask = (task: Task) => {
    if (projectId) {
      openTaskForm({ projectId, task });
    }
  };

  const handleDuplicateTask = (task: Task) => {
    if (projectId) {
      openTaskForm({ projectId, initialTask: task });
    }
  };
  const { query: searchQuery, focusInput } = useSearch();

  // Fullscreen state using custom hook
  const { isFullscreen, navigateToTask, navigateToAttempt, toggleFullscreen } =
    useTaskViewManager();

  // Stream tasks for this project
  const {
    tasks,
    tasksById,
    isLoading,
    error: streamError,
  } = useProjectTasks(projectId || '');

  // Derive panel state from URL
  const isPanelOpen = Boolean(taskId);
  const selectedTask = useMemo(
    () => (taskId ? (tasksById[taskId] ?? null) : null),
    [taskId, tasksById]
  );

  // Define task creation handler
  const handleCreateNewTask = useCallback(() => {
    handleCreateTask();
  }, [handleCreateTask]);

  // Semantic keyboard shortcuts for kanban page
  // Prevent default is needed to stop the input having the value 'c'
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
      preventDefault: true, // Prevent Firefox quick find
    }
  );

  useKeyExit(
    () => {
      if (isPanelOpen) {
        if (isFullscreen) {
          toggleFullscreen(false);
        } else {
          handleClosePanel();
        }
      } else {
        navigate('/projects');
      }
    },
    { scope: Scope.KANBAN }
  );

  // Toggle fullscreen with Cmd+Enter
  useKeyToggleFullscreen(() => toggleFullscreen(!isFullscreen), {
    scope: Scope.KANBAN,
  });

  // Navigation shortcuts using semantic hooks
  const taskStatuses = [
    'todo',
    'inprogress',
    'inreview',
    'done',
    'cancelled',
  ] as const;

  // Memoize filtered tasks based on search query
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

  // Memoize grouped filtered tasks
  const groupedFilteredTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    taskStatuses.forEach((status) => {
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
      preventDefault: true, // Prevent page scroll
    }
  );

  useKeyNavRight(
    () => {
      selectNextColumn();
    },
    {
      scope: Scope.KANBAN,
      preventDefault: true, // Prevent page scroll
    }
  );

  useKeyOpenDetails(() => {}, { scope: Scope.KANBAN });

  // Delete task shortcut
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
            // Task was deleted, close panel if this task was selected
            if (selectedTask?.id === taskId) {
              handleClosePanel();
            }
          })
          .catch(() => {
            // Modal was cancelled - do nothing
          });
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
    (task: Task, attemptIdToShow?: string, fullscreen?: boolean) => {
      if (attemptIdToShow) {
        navigateToAttempt(projectId!, task.id, attemptIdToShow, { fullscreen });
      } else {
        navigateToTask(projectId!, task.id, { fullscreen });
      }
    },
    [projectId, navigateToTask, navigateToAttempt]
  );

  // Navigation functions that use filtered/grouped tasks
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
      // Find first non-empty column
      for (const status of taskStatuses) {
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
      // Find first non-empty column
      for (const status of taskStatuses) {
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
      const currentIndex = taskStatuses.findIndex(
        (status) => status === selectedTask.status
      );
      // Find next non-empty column
      for (let i = currentIndex + 1; i < taskStatuses.length; i++) {
        const tasks = groupedFilteredTasks[taskStatuses[i]];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          return;
        }
      }
    } else {
      // Find first non-empty column
      for (const status of taskStatuses) {
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
      const currentIndex = taskStatuses.findIndex(
        (status) => status === selectedTask.status
      );
      // Find previous non-empty column
      for (let i = currentIndex - 1; i >= 0; i--) {
        const tasks = groupedFilteredTasks[taskStatuses[i]];
        if (tasks && tasks.length > 0) {
          handleViewTaskDetails(tasks[0]);
          return;
        }
      }
    } else {
      // Find first non-empty column
      for (const status of taskStatuses) {
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
        // UI will update via WebSocket stream
      } catch (err) {
        console.error('Failed to update task status:', err);
      }
    },
    [tasksById]
  );

  // Combine loading states for initial load
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

  return (
    <div
      className={`min-h-full ${getMainContainerClasses(isPanelOpen, isFullscreen)}`}
    >
      {streamError && (
        <Alert className="w-full z-30 xl:sticky xl:top-0">
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('common:states.reconnecting')}
          </AlertTitle>
          <AlertDescription>{streamError}</AlertDescription>
        </Alert>
      )}

      {/* Kanban + Panel Container - uses side-by-side layout on xl+ */}
      <div className="flex-1 min-h-0 xl:flex">
        {/* Left Column - Kanban Section */}
        <div className={getKanbanSectionClasses(isPanelOpen, isFullscreen)}>
          {tasks.length === 0 ? (
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
            <div className="w-full h-full">
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
          )}
        </div>
        {isPanelOpen && !projectLoading && (
          <KanbanSidebar selectedTask={selectedTask} />
        )}
      </div>
    </div>
  );
}
