import { useState, useEffect, useCallback } from 'react';
import { Globe2 } from 'lucide-react';
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
import { useUserSystem } from '@/components/config-provider';
import { templatesApi } from '@/lib/api';
import type { TaskStatus, TaskTemplate } from 'shared/types';

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
  onCreateAndStartTask?: (title: string, description: string) => Promise<void>;
  onUpdateTask?: (
    title: string,
    description: string,
    status: TaskStatus
  ) => Promise<void>;
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
}: TaskFormDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingAndStart, setIsSubmittingAndStart] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);

  const { config } = useUserSystem();
  const isEditMode = Boolean(task);

  // Check if there's any content that would be lost
  const hasUnsavedChanges = useCallback(() => {
    // Only warn in create mode when there's content
    if (!isEditMode) {
      return title.trim() !== '' || description.trim() !== '';
    }
    // No warning for edit mode - users can always reopen the task
    return false;
  }, [title, description, isEditMode]);

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
        await onCreateAndStartTask(title, description);
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
    config?.profile,
    isEditMode,
    onCreateAndStartTask,
    onOpenChange,
  ]);

  const handleCancel = useCallback(() => {
    // Check for unsaved changes before closing
    if (hasUnsavedChanges()) {
      setShowDiscardWarning(true);
    } else {
      onOpenChange(false);
    }
  }, [onOpenChange, hasUnsavedChanges]);

  const handleDiscardChanges = useCallback(() => {
    // Close both dialogs
    setShowDiscardWarning(false);
    onOpenChange(false);
  }, [onOpenChange]);

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

  // Handle dialog close attempt
  const handleDialogOpenChange = (open: boolean) => {
    if (!open && hasUnsavedChanges()) {
      // Trying to close with unsaved changes
      setShowDiscardWarning(true);
    } else {
      onOpenChange(open);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? 'Edit Task' : 'Create New Task'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                      isSubmitting || isSubmittingAndStart || !title.trim()
                    }
                  >
                    {isSubmitting ? 'Creating...' : 'Create Task'}
                  </Button>
                  {onCreateAndStartTask && (
                    <Button
                      onClick={handleCreateAndStart}
                      disabled={
                        isSubmitting || isSubmittingAndStart || !title.trim()
                      }
                      className={'font-medium'}
                    >
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

      {/* Discard Warning Dialog */}
      <Dialog open={showDiscardWarning} onOpenChange={setShowDiscardWarning}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              You have unsaved content in your new task. Are you sure you want
              You have unsaved changes. Are you sure you want to discard them?
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDiscardWarning(false)}
            >
              Continue Editing
            </Button>
            <Button variant="destructive" onClick={handleDiscardChanges}>
              Discard Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
