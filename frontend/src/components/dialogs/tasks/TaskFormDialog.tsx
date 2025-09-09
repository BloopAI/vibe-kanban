import { useState, useEffect, useCallback } from 'react';
import { Globe2, Settings2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageUploadSection } from '@/components/ui/ImageUploadSection';
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
import { templatesApi, imagesApi, projectsApi } from '@/lib/api';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useUserSystem } from '@/components/config-provider';
import { ExecutorProfileSelector } from '@/components/settings';
import BranchSelector from '@/components/tasks/BranchSelector';
import type {
  TaskStatus,
  TaskTemplate,
  ImageResponse,
  GitBranch,
  ExecutorProfileId,
} from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface TaskFormDialogProps {
  task?: Task | null; // Optional for create mode
  projectId?: string; // For file search functionality
  initialTemplate?: TaskTemplate | null; // For pre-filling from template
  initialTask?: Task | null; // For duplicating an existing task
}

export const TaskFormDialog = NiceModal.create<TaskFormDialogProps>(
  ({ task, projectId, initialTemplate, initialTask }) => {
    const modal = useModal();
    const { createTask, createAndStart, updateTask } =
      useTaskMutations(projectId);
    const { system, profiles } = useUserSystem();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<TaskStatus>('todo');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmittingAndStart, setIsSubmittingAndStart] = useState(false);
    const [templates, setTemplates] = useState<TaskTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [showDiscardWarning, setShowDiscardWarning] = useState(false);
    const [images, setImages] = useState<ImageResponse[]>([]);
    const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<
      string[]
    >([]);
    const [branches, setBranches] = useState<GitBranch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [selectedExecutorProfile, setSelectedExecutorProfile] =
      useState<ExecutorProfileId | null>(null);
    const [quickstartExpanded, setQuickstartExpanded] =
      useState<boolean>(false);

    const isEditMode = Boolean(task);

    // Check if there's any content that would be lost
    const hasUnsavedChanges = useCallback(() => {
      if (!isEditMode) {
        // Create mode - warn when there's content
        return title.trim() !== '' || description.trim() !== '';
      } else if (task) {
        // Edit mode - warn when current values differ from original task
        const titleChanged = title.trim() !== task.title.trim();
        const descriptionChanged =
          (description || '').trim() !== (task.description || '').trim();
        const statusChanged = status !== task.status;
        return titleChanged || descriptionChanged || statusChanged;
      }
      return false;
    }, [title, description, status, isEditMode, task]);

    // Warn on browser/tab close if there are unsaved changes
    useEffect(() => {
      if (!modal.visible) return; // dialog closed → nothing to do

      // always re-evaluate latest fields via hasUnsavedChanges()
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (hasUnsavedChanges()) {
          e.preventDefault();
          // Chrome / Edge still require returnValue to be set
          e.returnValue = '';
          return '';
        }
        // nothing returned → no prompt
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () =>
        window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [modal.visible, hasUnsavedChanges]); // hasUnsavedChanges is memoised with title/descr deps

    useEffect(() => {
      if (task) {
        // Edit mode - populate with existing task data
        setTitle(task.title);
        setDescription(task.description || '');
        setStatus(task.status);

        // Load existing images for the task
        if (modal.visible) {
          imagesApi
            .getTaskImages(task.id)
            .then((taskImages) => setImages(taskImages))
            .catch((err) => {
              console.error('Failed to load task images:', err);
              setImages([]);
            });
        }
      } else if (initialTask) {
        // Duplicate mode - pre-fill from existing task but reset status to 'todo' and no images
        setTitle(initialTask.title);
        setDescription(initialTask.description || '');
        setStatus('todo'); // Always start duplicated tasks as 'todo'
        setSelectedTemplate('');
        setImages([]);
        setNewlyUploadedImageIds([]);
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
        setImages([]);
        setNewlyUploadedImageIds([]);
        setSelectedBranch('');
        setSelectedExecutorProfile(system.config?.executor_profile || null);
        setQuickstartExpanded(false);
      }
    }, [
      task,
      initialTask,
      initialTemplate,
      modal.visible,
      system.config?.executor_profile,
    ]);

    // Fetch templates and branches when dialog opens in create mode
    useEffect(() => {
      if (modal.visible && !isEditMode && projectId) {
        // Fetch templates and branches
        Promise.all([
          templatesApi.listByProject(projectId),
          templatesApi.listGlobal(),
          projectsApi.getBranches(projectId),
        ])
          .then(([projectTemplates, globalTemplates, projectBranches]) => {
            // Combine templates with project templates first
            setTemplates([...projectTemplates, ...globalTemplates]);

            // Set branches and default to current branch
            setBranches(projectBranches);
            const currentBranch = projectBranches.find((b) => b.is_current);
            const defaultBranch = currentBranch || projectBranches[0];
            if (defaultBranch) {
              setSelectedBranch(defaultBranch.name);
            }
          })
          .catch(console.error);
      }
    }, [modal.visible, isEditMode, projectId]);

    // Set default executor from config (following TaskDetailsToolbar pattern)
    useEffect(() => {
      if (system.config?.executor_profile) {
        setSelectedExecutorProfile(system.config.executor_profile);
      }
    }, [system.config?.executor_profile]);

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

    // Handle image upload success by inserting markdown into description
    const handleImageUploaded = useCallback((image: ImageResponse) => {
      const markdownText = `![${image.original_name}](${image.file_path})`;
      setDescription((prev) => {
        if (prev.trim() === '') {
          return markdownText;
        } else {
          return prev + ' ' + markdownText;
        }
      });

      setImages((prev) => [...prev, image]);
      // Track as newly uploaded for backend association
      setNewlyUploadedImageIds((prev) => [...prev, image.id]);
    }, []);

    const handleImagesChange = useCallback((updatedImages: ImageResponse[]) => {
      setImages(updatedImages);
      // Also update newlyUploadedImageIds to remove any deleted image IDs
      setNewlyUploadedImageIds((prev) =>
        prev.filter((id) => updatedImages.some((img) => img.id === id))
      );
    }, []);

    const handleSubmit = useCallback(async () => {
      if (!title.trim() || !projectId) return;

      setIsSubmitting(true);
      try {
        let imageIds: string[] | undefined;

        if (isEditMode) {
          // In edit mode, send all current image IDs (existing + newly uploaded)
          imageIds =
            images.length > 0 ? images.map((img) => img.id) : undefined;
        } else {
          // In create mode, only send newly uploaded image IDs
          imageIds =
            newlyUploadedImageIds.length > 0
              ? newlyUploadedImageIds
              : undefined;
        }

        if (isEditMode && task) {
          updateTask.mutate(
            {
              taskId: task.id,
              data: {
                title,
                description: description || null,
                status,
                parent_task_attempt: null,
                image_ids: imageIds || null,
              },
            },
            {
              onSuccess: () => {
                modal.hide();
              },
            }
          );
        } else {
          createTask.mutate(
            {
              project_id: projectId,
              title,
              description: description || null,
              parent_task_attempt: null,
              image_ids: imageIds || null,
            },
            {
              onSuccess: () => {
                modal.hide();
              },
            }
          );
        }
      } finally {
        setIsSubmitting(false);
      }
    }, [
      title,
      description,
      status,
      isEditMode,
      projectId,
      task,
      modal,
      newlyUploadedImageIds,
      images,
      createTask,
      updateTask,
    ]);

    const handleCreateAndStart = useCallback(async () => {
      if (!title.trim() || !projectId) return;

      setIsSubmittingAndStart(true);
      try {
        if (!isEditMode) {
          const imageIds =
            newlyUploadedImageIds.length > 0
              ? newlyUploadedImageIds
              : undefined;

          // Use selected executor profile or fallback to config default
          const finalExecutorProfile =
            selectedExecutorProfile || system.config?.executor_profile;
          if (!finalExecutorProfile || !selectedBranch) {
            console.warn(
              `Missing ${!finalExecutorProfile ? 'executor profile' : 'branch'} for Create & Start`
            );
            return;
          }

          createAndStart.mutate(
            {
              task: {
                project_id: projectId,
                title,
                description: description || null,
                parent_task_attempt: null,
                image_ids: imageIds || null,
              },
              executor_profile_id: finalExecutorProfile,
              base_branch: selectedBranch,
            },
            {
              onSuccess: () => {
                modal.hide();
              },
            }
          );
        }
      } finally {
        setIsSubmittingAndStart(false);
      }
    }, [
      title,
      description,
      isEditMode,
      projectId,
      modal,
      newlyUploadedImageIds,
      createAndStart,
      selectedExecutorProfile,
      selectedBranch,
      system.config?.executor_profile,
    ]);

    const handleCancel = useCallback(() => {
      // Check for unsaved changes before closing
      if (hasUnsavedChanges()) {
        setShowDiscardWarning(true);
      } else {
        modal.hide();
      }
    }, [modal, hasUnsavedChanges]);

    const handleDiscardChanges = useCallback(() => {
      // Close both dialogs
      setShowDiscardWarning(false);
      modal.hide();
    }, [modal]);

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

      if (modal.visible) {
        document.addEventListener('keydown', handleKeyDown, true); // Use capture phase to get priority
        return () =>
          document.removeEventListener('keydown', handleKeyDown, true);
      }
    }, [
      modal.visible,
      isEditMode,
      title,
      handleSubmit,
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
      } else if (!open) {
        modal.hide();
      }
    };

    return (
      <>
        <Dialog open={modal.visible} onOpenChange={handleDialogOpenChange}>
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
                <Label
                  htmlFor="task-description"
                  className="text-sm font-medium"
                >
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

              <ImageUploadSection
                images={images}
                onImagesChange={handleImagesChange}
                onUpload={imagesApi.upload}
                onDelete={imagesApi.delete}
                onImageUploaded={handleImageUploaded}
                disabled={isSubmitting || isSubmittingAndStart}
                readOnly={isEditMode}
                collapsible={true}
                defaultExpanded={false}
              />

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

              {!isEditMode &&
                (() => {
                  const quickstartSection = (
                    <div className="pt-2">
                      <details
                        className="group"
                        open={quickstartExpanded}
                        onToggle={(e) =>
                          setQuickstartExpanded(
                            (e.target as HTMLDetailsElement).open
                          )
                        }
                      >
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-2">
                          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                          <Settings2 className="h-3 w-3" />
                          Quickstart
                        </summary>
                        <div className="mt-3 space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Configuration for "Create & Start" workflow
                          </p>

                          {/* Executor Profile Selector */}
                          {profiles && selectedExecutorProfile && (
                            <ExecutorProfileSelector
                              profiles={profiles}
                              selectedProfile={selectedExecutorProfile}
                              onProfileSelect={setSelectedExecutorProfile}
                              disabled={isSubmitting || isSubmittingAndStart}
                            />
                          )}

                          {/* Branch Selector */}
                          {branches.length > 0 && (
                            <div>
                              <Label
                                htmlFor="base-branch"
                                className="text-sm font-medium"
                              >
                                Branch
                              </Label>
                              <div className="mt-1.5">
                                <BranchSelector
                                  branches={branches}
                                  selectedBranch={selectedBranch}
                                  onBranchSelect={setSelectedBranch}
                                  placeholder="Select branch"
                                  className={
                                    isSubmitting || isSubmittingAndStart
                                      ? 'opacity-50 cursor-not-allowed'
                                      : ''
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>
                  );
                  return quickstartSection;
                })()}

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
                      variant="outline"
                      onClick={handleSubmit}
                      disabled={
                        isSubmitting || isSubmittingAndStart || !title.trim()
                      }
                    >
                      {isSubmitting ? 'Creating...' : 'Create Task'}
                    </Button>
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
);
