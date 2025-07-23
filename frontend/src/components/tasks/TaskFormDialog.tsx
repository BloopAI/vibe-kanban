import { useState, useEffect, useCallback } from 'react';
import { Globe2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConfig } from '@/components/config-provider';
import { templatesApi } from '@/lib/api';
import type { TaskStatus, ExecutorConfig, TaskTemplate } from 'shared/types';

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

interface TaskFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null; // Optional for create mode
  projectId?: string; // For file search functionality
  initialTemplate?: TaskTemplate | null; // For pre-filling from template
  onCreateTask?: (title: string, description: string) => Promise<void>;
  onCreateAndStartTask?: (
    title: string,
    description: string,
    executor?: ExecutorConfig
  ) => Promise<void>;
  onUpdateTask?: (
    title: string,
    description: string,
    status: TaskStatus
  ) => Promise<void>;
  // Plan context for disabling task creation when no plan exists
  planContext?: {
    isPlanningMode: boolean;
    canCreateTask: boolean;
    latestProcessHasNoPlan: boolean;
  };
}

export function TaskFormDialog({
  isOpen,
  onOpenChange,
  task,
  projectId,
  initialTemplate,
  onCreateTask,
  onCreateAndStartTask,
  onUpdateTask,
  planContext,
}: TaskFormDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingAndStart, setIsSubmittingAndStart] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const { config } = useConfig();
  const isEditMode = Boolean(task);

  // Check if task creation should be disabled based on plan context
  const isPlanningModeWithoutPlan =
    planContext?.isPlanningMode && !planContext?.canCreateTask;
  const showPlanWarning =
    planContext?.isPlanningMode && planContext?.latestProcessHasNoPlan;

  useEffect(() => {
    if (task) {
      // Edit mode - populate with existing task data
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
    } else if (initialTemplate) {
      // Create mode with template - pre-fill from template
      setTitle(initialTemplate.title);
      setDescription(initialTemplate.description || '');
      setStatus('todo');
      setSelectedTemplate('');
    } else {
      // Create mode - reset to defaults
      setTitle('');
      setDescription('');
      setStatus('todo');
      setSelectedTemplate('');
    }
  }, [task, initialTemplate, isOpen]);

  // Fetch templates when dialog opens in create mode
  useEffect(() => {
    if (isOpen && !isEditMode && projectId) {
      // Fetch both project and global templates
      Promise.all([
        templatesApi.listByProject(projectId),
        templatesApi.listGlobal(),
      ])
        .then(([projectTemplates, globalTemplates]) => {
          // Combine templates with project templates first
          setTemplates([...projectTemplates, ...globalTemplates]);
        })
        .catch(console.error);
    }
  }, [isOpen, isEditMode, projectId]);

  // Handle template selection
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId === 'none') {
      // Clear the form when "No template" is selected
      setTitle('');
      setDescription('');
    } else if (templateId) {
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        setTitle(template.title);
        setDescription(template.description || '');
      }
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      if (isEditMode && onUpdateTask) {
        await onUpdateTask(title, description, status);
      } else if (!isEditMode && onCreateTask) {
        await onCreateTask(title, description);
      }

      // Reset form on successful creation
      if (!isEditMode) {
        setTitle('');
        setDescription('');
        setStatus('todo');
      }

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAndStart = useCallback(async () => {
    if (!title.trim()) return;

    setIsSubmittingAndStart(true);
    try {
      if (!isEditMode && onCreateAndStartTask) {
        await onCreateAndStartTask(title, description, config?.executor);
      }

      // Reset form on successful creation
      setTitle('');
      setDescription('');
      setStatus('todo');

      onOpenChange(false);
    } finally {
      setIsSubmittingAndStart(false);
    }
  }, [
    title,
    description,
    config?.executor,
    isEditMode,
    onCreateAndStartTask,
    onOpenChange,
  ]);

  const handleCancel = useCallback(() => {
    // Reset form state when canceling
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
    } else {
      setTitle('');
      setDescription('');
      setStatus('todo');
      setSelectedTemplate('');
    }
    onOpenChange(false);
  }, [task, onOpenChange]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ESC to close dialog (prevent it from reaching TaskDetailsPanel)
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleCancel();
        return;
      }

      // Command/Ctrl + Enter to Create & Start (create mode) or Save (edit mode)
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        if (
          !isEditMode &&
          onCreateAndStartTask &&
          title.trim() &&
          !isSubmitting &&
          !isSubmittingAndStart
        ) {
          event.preventDefault();
          handleCreateAndStart();
        } else if (
          isEditMode &&
          title.trim() &&
          !isSubmitting &&
          !isSubmittingAndStart
        ) {
          event.preventDefault();
          handleSubmit();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown, true); // Use capture phase to get priority
      return () => document.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [
    isOpen,
    isEditMode,
    onCreateAndStartTask,
    title,
    isSubmitting,
    isSubmittingAndStart,
    handleCreateAndStart,
    handleCancel,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Edit Task' : 'Create New Task'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Plan warning when in planning mode without plan */}
          {showPlanWarning && (
            <div className="p-4 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                  Plan Required
                </p>
              </div>
              <p className="text-sm text-orange-700 dark:text-orange-400">
                No plan was generated in the last execution attempt. Task
                creation is disabled until a plan is available. Please generate
                a plan first.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="task-title" className="text-sm font-medium">
              Title
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="mt-1.5"
              disabled={isSubmitting || isSubmittingAndStart}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="task-description" className="text-sm font-medium">
              Description
            </Label>
            <FileSearchTextarea
              value={description}
              onChange={setDescription}
              rows={3}
              maxRows={8}
              placeholder="Add more details (optional). Type @ to search files."
              className="mt-1.5"
              disabled={isSubmitting || isSubmittingAndStart}
              projectId={projectId}
            />
          </div>

          {!isEditMode && templates.length > 0 && (
            <div className="pt-2">
              <details className="group">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-2">
                  <svg
                    className="h-3 w-3 transition-transform group-open:rotate-90"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Use a template
                </summary>
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Templates help you quickly create tasks with predefined
                    content.
                  </p>
                  <Select
                    value={selectedTemplate}
                    onValueChange={handleTemplateChange}
                  >
                    <SelectTrigger id="task-template" className="w-full">
                      <SelectValue placeholder="Choose a template to prefill this form" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No template</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          <div className="flex items-center gap-2">
                            {template.project_id === null && (
                              <Globe2 className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span>{template.template_name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </details>
            </div>
          )}

          {isEditMode && (
            <div className="pt-2">
              <Label htmlFor="task-status" className="text-sm font-medium">
                Status
              </Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as TaskStatus)}
                disabled={isSubmitting || isSubmittingAndStart}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="inprogress">In Progress</SelectItem>
                  <SelectItem value="inreview">In Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting || isSubmittingAndStart}
            >
              Cancel
            </Button>
            {isEditMode ? (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim()}
              >
                {isSubmitting ? 'Updating...' : 'Update Task'}
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting ||
                    isSubmittingAndStart ||
                    !title.trim() ||
                    isPlanningModeWithoutPlan
                  }
                  className={
                    isPlanningModeWithoutPlan
                      ? 'opacity-60 cursor-not-allowed'
                      : ''
                  }
                  title={
                    isPlanningModeWithoutPlan
                      ? 'Plan required before creating task'
                      : undefined
                  }
                >
                  {isPlanningModeWithoutPlan && (
                    <AlertTriangle className="h-4 w-4 mr-2" />
                  )}
                  {isSubmitting ? 'Creating...' : 'Create Task'}
                </Button>
                {onCreateAndStartTask && (
                  <Button
                    onClick={handleCreateAndStart}
                    disabled={
                      isSubmitting ||
                      isSubmittingAndStart ||
                      !title.trim() ||
                      isPlanningModeWithoutPlan
                    }
                    className={`font-medium ${isPlanningModeWithoutPlan ? 'opacity-60 cursor-not-allowed bg-red-600 hover:bg-red-600' : ''}`}
                    title={
                      isPlanningModeWithoutPlan
                        ? 'Plan required before creating and starting task'
                        : undefined
                    }
                  >
                    {isPlanningModeWithoutPlan && (
                      <AlertTriangle className="h-4 w-4 mr-2" />
                    )}
                    {isSubmittingAndStart
                      ? 'Creating & Starting...'
                      : 'Create & Start'}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
