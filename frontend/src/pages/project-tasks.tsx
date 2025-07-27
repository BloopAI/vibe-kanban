import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FolderOpen, Plus, Settings, LibraryBig, Globe2 } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { projectsApi, tasksApi, templatesApi } from '@/lib/api';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';
import { ProjectForm } from '@/components/projects/project-form';
import { TaskTemplateManager } from '@/components/TaskTemplateManager';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts';
import { useTaskPlan } from '@/components/context/TaskPlanContext';
import { useTranslation } from '@/lib/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import {
  getKanbanSectionClasses,
  getMainContainerClasses,
} from '@/lib/responsive-config';

import TaskKanbanBoard from '@/components/tasks/TaskKanbanBoard';
import { TaskDetailsPanel } from '@/components/tasks/TaskDetailsPanel';
import type {
  CreateTaskAndStart,
  ExecutorConfig,
  ProjectWithBranch,
  TaskStatus,
  TaskWithAttemptStatus,
  TaskTemplate,
} from 'shared/types';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';

type Task = TaskWithAttemptStatus;

export function ProjectTasks() {
  const { projectId, taskId } = useParams<{
    projectId: string;
    taskId?: string;
  }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [project, setProject] = useState<ProjectWithBranch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(
    null
  );

  // Template management state
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);

  // Panel state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Plan context for task creation
  const { isPlanningMode, canCreateTask, latestProcessHasNoPlan } =
    useTaskPlan();

  // Define task creation handler
  const handleCreateNewTask = useCallback(() => {
    setEditingTask(null);
    setSelectedTemplate(null);
    setIsTaskDialogOpen(true);
  }, []);

  // Handle template selection
  const handleTemplateSelect = useCallback((template: TaskTemplate) => {
    setEditingTask(null);
    setSelectedTemplate(template);
    setIsTaskDialogOpen(true);
  }, []);

  const handleOpenInIDE = useCallback(async () => {
    if (!projectId) return;

    try {
      await projectsApi.openEditor(projectId);
    } catch (error) {
      console.error('Failed to open project in IDE:', error);
      setError(t('tasks.failedOpenIDE'));
    }
  }, [projectId]);

  const fetchProject = useCallback(async () => {
    try {
      const result = await projectsApi.getWithBranch(projectId!);
      setProject(result);
    } catch (err) {
      setError(t('tasks.failedLoadProject'));
    }
  }, [projectId, navigate]);

  const fetchTemplates = useCallback(async () => {
    if (!projectId) return;

    try {
      const [projectTemplates, globalTemplates] = await Promise.all([
        templatesApi.listByProject(projectId),
        templatesApi.listGlobal(),
      ]);

      // Combine templates with project templates first
      setTemplates([...projectTemplates, ...globalTemplates]);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  }, [projectId]);

  // Template management handlers
  const handleOpenTemplateManager = useCallback(() => {
    setIsTemplateManagerOpen(true);
  }, []);

  const handleCloseTemplateManager = useCallback(() => {
    setIsTemplateManagerOpen(false);
    fetchTemplates(); // Refresh templates list when closing
  }, [fetchTemplates]);

  const fetchTasks = useCallback(
    async (skipLoading = false) => {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        const result = await tasksApi.getAll(projectId!);
        // Only update if data has actually changed
        setTasks((prevTasks) => {
          const newTasks = result;
          if (JSON.stringify(prevTasks) === JSON.stringify(newTasks)) {
            return prevTasks; // Return same reference to prevent re-render
          }

          setSelectedTask((prev) => {
            if (!prev) return prev;

            const updatedSelectedTask = newTasks.find(
              (task) => task.id === prev.id
            );

            if (JSON.stringify(prev) === JSON.stringify(updatedSelectedTask))
              return prev;
            return updatedSelectedTask || prev;
          });

          return newTasks;
        });
      } catch (err) {
        setError(t('tasks.failedLoadTasks'));
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    },
    [projectId]
  );

  const handleCreateTask = useCallback(
    async (title: string, description: string) => {
      try {
        const createdTask = await tasksApi.create(projectId!, {
          project_id: projectId!,
          title,
          description: description || null,
          parent_task_attempt: null,
        });
        await fetchTasks();
        // Open the newly created task in the details panel
        navigate(`/projects/${projectId}/tasks/${createdTask.id}`, {
          replace: true,
        });
      } catch (err) {
        setError(t('tasks.failedCreateTask'));
      }
    },
    [projectId, fetchTasks, navigate]
  );

  const handleCreateAndStartTask = useCallback(
    async (title: string, description: string, executor?: ExecutorConfig) => {
      try {
        const payload: CreateTaskAndStart = {
          project_id: projectId!,
          title,
          description: description || null,
          parent_task_attempt: null,
          executor: executor || null,
        };
        const result = await tasksApi.createAndStart(projectId!, payload);
        await fetchTasks();
        // Open the newly created task in the details panel
        handleViewTaskDetails(result);
      } catch (err) {
        setError(t('tasks.failedCreateAndStartTask'));
      }
    },
    [projectId, fetchTasks]
  );

  const handleUpdateTask = useCallback(
    async (title: string, description: string, status: TaskStatus) => {
      if (!editingTask) return;

      try {
        await tasksApi.update(projectId!, editingTask.id, {
          title,
          description: description || null,
          status,
          parent_task_attempt: null,
        });
        await fetchTasks();
        setEditingTask(null);
      } catch (err) {
        setError(t('tasks.failedUpdateTask'));
      }
    },
    [projectId, editingTask, fetchTasks]
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (!confirm(t('tasks.actions.confirmDelete'))) return;

      try {
        await tasksApi.delete(projectId!, taskId);
        await fetchTasks();
      } catch (error) {
        setError(t('tasks.failedDeleteTask'));
      }
    },
    [projectId, fetchTasks]
  );

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setIsTaskDialogOpen(true);
  }, []);

  const handleViewTaskDetails = useCallback(
    (task: Task) => {
      // setSelectedTask(task);
      // setIsPanelOpen(true);
      // Update URL to include task ID
      navigate(`/projects/${projectId}/tasks/${task.id}`, { replace: true });
    },
    [projectId, navigate]
  );

  const handleClosePanel = useCallback(() => {
    // setIsPanelOpen(false);
    // setSelectedTask(null);
    // Remove task ID from URL when closing panel
    navigate(`/projects/${projectId}/tasks`, { replace: true });
  }, [projectId, navigate]);

  const handleProjectSettingsSuccess = useCallback(() => {
    setIsProjectSettingsOpen(false);
    fetchProject(); // Refresh project data after settings change
  }, [fetchProject]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || !active.data.current) return;

      const taskId = active.id as string;
      const newStatus = over.id as Task['status'];
      const task = tasks.find((t) => t.id === taskId);

      if (!task || task.status === newStatus) return;

      // Optimistically update the UI immediately
      const previousStatus = task.status;
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );

      try {
        await tasksApi.update(projectId!, taskId, {
          title: task.title,
          description: task.description,
          status: newStatus,
          parent_task_attempt: task.parent_task_attempt,
        });
      } catch (err) {
        // Revert the optimistic update if the API call failed
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: previousStatus } : t
          )
        );
        setError(t('tasks.failedUpdateStatus'));
      }
    },
    [projectId, tasks]
  );

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    navigate,
    currentPath: `/projects/${projectId}/tasks`,
    hasOpenDialog:
      isTaskDialogOpen || isTemplateManagerOpen || isProjectSettingsOpen,
    closeDialog: () => setIsTaskDialogOpen(false),
    onC: handleCreateNewTask,
  });

  // Initialize data when projectId changes
  useEffect(() => {
    if (projectId) {
      fetchProject();
      fetchTasks();
      fetchTemplates();

      // Set up polling to refresh tasks every 5 seconds
      const interval = setInterval(() => {
        fetchTasks(true); // Skip loading spinner for polling
      }, 2000);

      // Cleanup interval on unmount
      return () => clearInterval(interval);
    }
  }, [projectId]);

  // Handle direct navigation to task URLs
  useEffect(() => {
    if (taskId && tasks.length > 0) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        setSelectedTask((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(task)) return prev;
          return task;
        });
        setIsPanelOpen(true);
      } else {
        // Task not found in current array - refetch to get latest data
        fetchTasks(true);
      }
    } else if (taskId && tasks.length === 0 && !loading) {
      // If we have a taskId but no tasks loaded, fetch tasks
      fetchTasks();
    } else if (!taskId) {
      // Close panel when no taskId in URL
      setIsPanelOpen(false);
      setSelectedTask(null);
    }
  }, [taskId, tasks, loading, fetchTasks]);

  if (loading) {
    return <Loader message={t('tasks.loading')} size={32} className="py-8" />;
  }

  if (error) {
    return <div className="text-center py-8 text-destructive">{error}</div>;
  }

  return (
    <div className={getMainContainerClasses(isPanelOpen)}>
      {/* Left Column - Kanban Section */}
      <div className={getKanbanSectionClasses(isPanelOpen)}>
        {/* Header */}

        <div className="px-8 my-12 flex flex-row">
          <div className="w-full flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project?.name || 'Project'}</h1>
            {project?.current_branch && (
              <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-md">
                {project.current_branch}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenInIDE}
              className="h-8 w-8 p-0"
              title={t('tasks.openInIDE')}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsProjectSettingsOpen(true)}
              className="h-8 w-8 p-0"
              title={t('tasks.projectSettings')}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="text"
              placeholder={t('tasks.searchTasks')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <Button onClick={handleCreateNewTask}>
              <Plus className="h-4 w-4 mr-2" />
              {t('tasks.addTask')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <LibraryBig className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[250px]">
                <DropdownMenuItem onClick={handleOpenTemplateManager}>
                  <Plus className="h-3 w-3 mr-2" />
                  {t('tasks.manageTemplates')}
                </DropdownMenuItem>
                {templates.length > 0 && <DropdownMenuSeparator />}

                {/* Project Templates */}
                {templates.filter((t) => t.project_id !== null).length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                      {t('tasks.projectTemplates')}
                    </div>
                    {templates
                      .filter((t) => t.project_id !== null)
                      .map((template) => (
                        <DropdownMenuItem
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                        >
                          <span className="truncate">
                            {template.template_name}
                          </span>
                        </DropdownMenuItem>
                      ))}
                  </>
                )}

                {/* Separator if both types exist */}
                {templates.filter((t) => t.project_id !== null).length > 0 &&
                  templates.filter((t) => t.project_id === null).length > 0 && (
                    <DropdownMenuSeparator />
                  )}

                {/* Global Templates */}
                {templates.filter((t) => t.project_id === null).length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                      {t('tasks.globalTemplates')}
                    </div>
                    {templates
                      .filter((t) => t.project_id === null)
                      .map((template) => (
                        <DropdownMenuItem
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                        >
                          <Globe2 className="h-3 w-3 mr-2 text-muted-foreground" />
                          <span className="truncate">
                            {template.template_name}
                          </span>
                        </DropdownMenuItem>
                      ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tasks View */}
        {tasks.length === 0 ? (
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  {t('tasks.noTasksFound')}
                </p>
                <Button className="mt-4" onClick={handleCreateNewTask}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('tasks.createFirstTask')}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="px-8 overflow-x-scroll my-4">
            <div className="min-w-[900px] max-w-[2000px] relative py-1">
              <TaskKanbanBoard
                tasks={tasks}
                searchQuery={searchQuery}
                onDragEnd={handleDragEnd}
                onEditTask={handleEditTask}
                onDeleteTask={handleDeleteTask}
                onViewTaskDetails={handleViewTaskDetails}
                isPanelOpen={isPanelOpen}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right Column - Task Details Panel */}
      {isPanelOpen && (
        <TaskDetailsPanel
          task={selectedTask}
          projectHasDevScript={!!project?.dev_script}
          projectId={projectId!}
          onClose={handleClosePanel}
          onEditTask={handleEditTask}
          onDeleteTask={handleDeleteTask}
          isDialogOpen={isTaskDialogOpen || isProjectSettingsOpen}
        />
      )}

      {/* Dialogs - rendered at main container level to avoid stacking issues */}
      <TaskFormDialog
        isOpen={isTaskDialogOpen}
        onOpenChange={(open) => {
          setIsTaskDialogOpen(open);
          if (!open) {
            setSelectedTemplate(null);
          }
        }}
        task={editingTask}
        projectId={projectId}
        onCreateTask={handleCreateTask}
        onCreateAndStartTask={handleCreateAndStartTask}
        onUpdateTask={handleUpdateTask}
        initialTemplate={selectedTemplate}
        planContext={{
          isPlanningMode,
          canCreateTask,
          latestProcessHasNoPlan,
        }}
      />

      <ProjectForm
        open={isProjectSettingsOpen}
        onClose={() => setIsProjectSettingsOpen(false)}
        onSuccess={handleProjectSettingsSuccess}
        project={project}
      />

      {/* Template Manager Dialog */}
      <Dialog
        open={isTemplateManagerOpen}
        onOpenChange={setIsTemplateManagerOpen}
      >
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('tasks.manageTemplates')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <TaskTemplateManager projectId={projectId} />
          </div>
          <DialogFooter>
            <Button onClick={handleCloseTemplateManager}>{t('tasks.done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
