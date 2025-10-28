import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings2, ArrowDown, Plus, Image, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ImageUploadSection,
  type ImageUploadSectionHandle,
} from '@/components/ui/ImageUploadSection';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TaskDialog, TaskDialogContent } from './TaskDialog';
import { Input } from '@/components/ui/input';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { imagesApi, projectsApi, attemptsApi } from '@/lib/api';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useUserSystem } from '@/components/config-provider';
import BranchSelector from '@/components/tasks/BranchSelector';
import type {
  TaskStatus,
  ImageResponse,
  GitBranch,
  ExecutorProfileId,
  BaseCodingAgent,
} from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useKeySubmitTask, useKeySubmitTaskAlt, Scope } from '@/keyboard';

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
  projectId?: string; // For file search and tag functionality
  initialTask?: Task | null; // For duplicating an existing task
  initialBaseBranch?: string; // For pre-selecting base branch in spinoff
  parentTaskAttemptId?: string; // For linking to parent task attempt
}

export const TaskFormDialog = NiceModal.create<TaskFormDialogProps>(
  ({
    task,
    projectId,
    initialTask,
    initialBaseBranch,
    parentTaskAttemptId,
  }) => {
    const modal = useModal();
    const { createTask, createAndStart, updateTask } =
      useTaskMutations(projectId);
    const { system, profiles } = useUserSystem();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<TaskStatus>('todo');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDiscardWarning, setShowDiscardWarning] = useState(false);
    const [images, setImages] = useState<ImageResponse[]>([]);
    const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<
      string[]
    >([]);
    const [branches, setBranches] = useState<GitBranch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [selectedExecutorProfile, setSelectedExecutorProfile] =
      useState<ExecutorProfileId | null>(null);
    const [showImageUpload, setShowImageUpload] = useState(false);
    const [autoStart, setAutoStart] = useState(true);
    const imageUploadRef = useRef<ImageUploadSectionHandle>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const dragCounterRef = useRef(0);

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
      if (!modal.visible || isSubmitting) return;

      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (hasUnsavedChanges()) {
          e.preventDefault();
          e.returnValue = '';
          return '';
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () =>
        window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [modal.visible, hasUnsavedChanges, isSubmitting]);

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
            .then((taskImages) => {
              setImages(taskImages);
              if (taskImages.length > 0) {
                setShowImageUpload(true);
              }
            })
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
        setImages([]);
        setNewlyUploadedImageIds([]);
      } else {
        // Create mode - reset to defaults
        setTitle('');
        setDescription('');
        setStatus('todo');
        setImages([]);
        setNewlyUploadedImageIds([]);
        setSelectedBranch('');
        setSelectedExecutorProfile(system.config?.executor_profile || null);
      }
    }, [task, initialTask, modal.visible, system.config?.executor_profile]);

    // Fetch branches when dialog opens in create mode
    useEffect(() => {
      if (modal.visible && !isEditMode && projectId) {
        projectsApi
          .getBranches(projectId)
          .then((projectBranches) => {
            // Set branches and default to initialBaseBranch if provided, otherwise current branch
            setBranches(projectBranches);

            if (
              initialBaseBranch &&
              projectBranches.some((b) => b.name === initialBaseBranch)
            ) {
              // Use initialBaseBranch if it exists in the project branches (for spinoff)
              setSelectedBranch(initialBaseBranch);
            } else {
              // Default behavior: use current branch or first available
              const currentBranch = projectBranches.find((b) => b.is_current);
              const defaultBranch = currentBranch || projectBranches[0];
              if (defaultBranch) {
                setSelectedBranch(defaultBranch.name);
              }
            }
          })
          .catch(console.error);
      }
    }, [modal.visible, isEditMode, projectId, initialBaseBranch]);

    // Fetch parent base branch when parentTaskAttemptId is provided
    useEffect(() => {
      if (
        modal.visible &&
        !isEditMode &&
        parentTaskAttemptId &&
        !initialBaseBranch &&
        branches.length > 0
      ) {
        attemptsApi
          .get(parentTaskAttemptId)
          .then((attempt) => {
            const parentBranch = attempt.branch || attempt.target_branch;
            if (parentBranch && branches.some((b) => b.name === parentBranch)) {
              setSelectedBranch(parentBranch);
            }
          })
          .catch(() => {
            // Silently fail, will use current branch fallback
          });
      }
    }, [
      modal.visible,
      isEditMode,
      parentTaskAttemptId,
      initialBaseBranch,
      branches,
    ]);

    // Set default executor from config
    useEffect(() => {
      if (system.config?.executor_profile) {
        setSelectedExecutorProfile(system.config.executor_profile);
      }
    }, [system.config?.executor_profile]);

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

    const handlePasteImages = useCallback((files: File[]) => {
      if (files.length === 0) return;
      // Show image upload section when images are pasted
      setShowImageUpload(true);
      void imageUploadRef.current?.addFiles(files);
    }, []);

    // Handle direct file selection from paperclip button
    const handleFileSelect = useCallback(() => {
      fileInputRef.current?.click();
    }, []);

    const handleFileInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
          setShowImageUpload(true);
          void imageUploadRef.current?.addFiles(files);
        }
        // Reset input value so same file can be selected again
        e.target.value = '';
      },
      []
    );

    // Drag and drop handlers
    const handleDragEnter = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if dragging files
      if (e.dataTransfer.types.includes('Files')) {
        dragCounterRef.current++;
        if (dragCounterRef.current === 1) {
          setIsDraggingFile(true);
        }
      }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (dragCounterRef.current > 0) {
        dragCounterRef.current--;
      }
      if (dragCounterRef.current === 0) {
        setIsDraggingFile(false);
      }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current = 0;
      setIsDraggingFile(false);

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/')
      );

      if (files.length > 0) {
        setShowImageUpload(true);
        void imageUploadRef.current?.addFiles(files);
      }
    }, []);

    const handleSubmit = useCallback(async () => {
      if (!title.trim() || !projectId || isSubmitting) {
        return;
      }

      setIsSubmitting(true);
      try {
        let imageIds: string[] | undefined;

        if (isEditMode) {
          // In edit mode, send all current image IDs (existing + newly uploaded)
          // The backend replaces all image associations with this list, so:
          // - Deleted images are not included → backend removes those associations
          // - Newly uploaded images are included → backend adds those associations
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
          await updateTask.mutateAsync(
            {
              taskId: task.id,
              data: {
                title,
                description: description,
                status,
                parent_task_attempt: parentTaskAttemptId || null,
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
          await createTask.mutateAsync(
            {
              project_id: projectId,
              title,
              description: description,
              status: null,
              parent_task_attempt: parentTaskAttemptId || null,
              image_ids: imageIds || null,
              shared_task_id: null,
            },
            {
              onSuccess: () => {
                modal.hide();
              },
            }
          );
        }
      } catch (error) {
        // Error already handled by mutation onError
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
      isSubmitting,
      parentTaskAttemptId,
    ]);

    const handleCreateAndStart = useCallback(async () => {
      if (!title.trim() || !projectId || isEditMode || isSubmitting) {
        return;
      }

      setIsSubmitting(true);
      try {
        const imageIds =
          newlyUploadedImageIds.length > 0 ? newlyUploadedImageIds : undefined;

        // Use selected executor profile or fallback to config default
        const finalExecutorProfile =
          selectedExecutorProfile || system.config?.executor_profile;
        if (!finalExecutorProfile || !selectedBranch) {
          console.warn(
            `Missing ${
              !finalExecutorProfile ? 'executor profile' : 'branch'
            } for Create & Start`
          );
          return;
        }

        await createAndStart.mutateAsync(
          {
            task: {
              project_id: projectId,
              title,
              description: description,
              status: null,
              parent_task_attempt: parentTaskAttemptId || null,
              image_ids: imageIds || null,
              shared_task_id: null,
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
      } catch (error) {
        // Error already handled by mutation onError
      } finally {
        setIsSubmitting(false);
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
      isSubmitting,
      parentTaskAttemptId,
    ]);

    const handleDiscardChanges = useCallback(() => {
      // Close both dialogs
      setShowDiscardWarning(false);
      modal.hide();
    }, [modal]);

    // Handle keyboard shortcuts
    const primaryAction = useCallback(() => {
      if (isSubmitting || !title.trim()) return;
      if (isEditMode) {
        void handleSubmit();
        return;
      }
      if (autoStart) {
        void handleCreateAndStart();
      } else {
        void handleSubmit();
      }
    }, [
      isSubmitting,
      title,
      isEditMode,
      autoStart,
      handleSubmit,
      handleCreateAndStart,
    ]);

    const alternateAction = useCallback(() => {
      if (isSubmitting || !title.trim()) return;
      if (isEditMode) {
        void handleSubmit();
        return;
      }
      // Alternate = opposite of primary in create mode
      if (autoStart) {
        void handleSubmit(); // create only
      } else {
        void handleCreateAndStart(); // create and start
      }
    }, [
      isSubmitting,
      title,
      isEditMode,
      autoStart,
      handleSubmit,
      handleCreateAndStart,
    ]);

    const shortcutsEnabled =
      modal.visible && !isSubmitting && !!title.trim() && !showDiscardWarning;

    useKeySubmitTask(primaryAction, {
      enabled: shortcutsEnabled,
      scope: Scope.DIALOG,
      enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
      preventDefault: true,
    });
    useKeySubmitTaskAlt(alternateAction, {
      enabled: shortcutsEnabled,
      scope: Scope.DIALOG,
      enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
      preventDefault: true,
    });

    // Handle dialog close attempt
    const handleDialogOpenChange = (open: boolean) => {
      if (!open && hasUnsavedChanges()) {
        // Trying to close with unsaved changes
        setShowDiscardWarning(true);
      } else if (!open) {
        modal.hide();
      }
    };

    // Agent selector component
    const AgentSelector = ({ className = '' }: { className?: string }) => {
      if (!profiles) return null;
      const agents = Object.keys(profiles).sort() as BaseCodingAgent[];
      const selectedAgent = selectedExecutorProfile?.executor;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`w-full justify-between text-xs ${className}`}
              disabled={isSubmitting}
              aria-label="Select agent"
            >
              <div className="flex items-center gap-1.5 w-full">
                <Bot className="h-3 w-3" />
                <span className="truncate">{selectedAgent || 'Agent'}</span>
              </div>
              <ArrowDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            {agents.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No agents available
              </div>
            ) : (
              agents.map((agent) => (
                <DropdownMenuItem
                  key={agent}
                  onClick={() => {
                    setSelectedExecutorProfile({
                      executor: agent,
                      variant: null,
                    });
                  }}
                  className={selectedAgent === agent ? 'bg-accent' : ''}
                >
                  {agent}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    };

    // Configuration selector component
    const ConfigSelector = ({ className = '' }: { className?: string }) => {
      const selectedAgent = selectedExecutorProfile?.executor;
      if (!selectedAgent || !profiles) return null;

      const configs = profiles[selectedAgent];
      if (!configs || Object.keys(configs).length === 0) return null;

      const configOptions = Object.keys(configs).sort();
      const selectedVariant = selectedExecutorProfile?.variant || 'DEFAULT';

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`w-full justify-between text-xs ${className}`}
              disabled={isSubmitting}
              aria-label="Select configuration"
            >
              <div className="flex items-center gap-1.5 w-full">
                <Settings2 className="h-3 w-3" />
                <span className="truncate">{selectedVariant}</span>
              </div>
              <ArrowDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            {configOptions.map((variant) => (
              <DropdownMenuItem
                key={variant}
                onClick={() => {
                  setSelectedExecutorProfile({
                    executor: selectedAgent,
                    variant: variant === 'DEFAULT' ? null : variant,
                  });
                }}
                className={
                  (variant === 'DEFAULT' ? null : variant) ===
                  selectedExecutorProfile?.variant
                    ? 'bg-accent'
                    : ''
                }
              >
                {variant}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    };

    return (
      <>
        <TaskDialog
          open={modal.visible}
          onOpenChange={handleDialogOpenChange}
          className="w-full max-w-[min(90vw,40rem)] max-h-[min(95vh,50rem)]"
          uncloseable={showDiscardWarning}
          ariaLabel={isEditMode ? 'Edit task' : 'Create new task'}
        >
          <TaskDialogContent
            className="h-full overflow-hidden flex flex-col gap-0 px-4 pb-4 relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Drag overlay */}
            {isDraggingFile && (
              <div className="absolute inset-0 z-50 bg-primary/95 border-2 border-dashed border-primary-foreground/50 rounded-lg flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Image className="h-12 w-12 mx-auto mb-2 text-primary-foreground" />
                  <p className="text-lg font-medium text-primary-foreground">
                    Drop images here
                  </p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1 pb-3">
              {/* Title Input */}
              <div className="pr-8 pt-3">
                <Input
                  id="task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task title"
                  className="text-lg font-medium border-none shadow-none px-0 placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              {/* Description Input */}
              <div>
                <FileSearchTextarea
                  value={description}
                  onChange={setDescription}
                  rows={4}
                  maxRows={30}
                  placeholder="Add more details (optional). Type @ to search files."
                  className="border-none shadow-none px-0 resize-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  disabled={isSubmitting}
                  projectId={projectId}
                  onPasteFiles={handlePasteImages}
                />
              </div>

              {/* Image Upload Section */}
              {showImageUpload && (
                <ImageUploadSection
                  ref={imageUploadRef}
                  images={images}
                  onImagesChange={handleImagesChange}
                  onUpload={imagesApi.upload}
                  onDelete={imagesApi.delete}
                  onImageUploaded={handleImageUploaded}
                  disabled={isSubmitting}
                  collapsible={false}
                  defaultExpanded={true}
                  hideDropZone={true}
                />
              )}

              {/* Status Selector (Edit Mode Only) */}
              {isEditMode && (
                <div className="space-y-2">
                  <Label htmlFor="task-status" className="text-sm font-medium">
                    Status
                  </Label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as TaskStatus)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
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

              {/* Agent, Config & Branch Selectors Row (Create Mode, AutoStart Only) */}
              {!isEditMode && (
                <div
                  className={`flex items-center gap-2 h-9 transition-opacity duration-200 ${
                    autoStart ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  {profiles && <AgentSelector className="h-9 flex-1" />}
                  {profiles && <ConfigSelector className="h-9 flex-1" />}
                  {branches.length > 0 && (
                    <BranchSelector
                      branches={branches}
                      selectedBranch={selectedBranch}
                      onBranchSelect={setSelectedBranch}
                      placeholder="Branch"
                      className={`h-9 flex-1 text-xs ${
                        isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Bottom Action Bar */}
            <div className="border-t pt-3 flex items-center justify-between gap-3">
              {/* Left Side - Image Attach Button */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFileSelect}
                  className="h-9 w-9 p-0 rounded-none"
                  aria-label="Attach image"
                >
                  <Image className="h-4 w-4" />
                </Button>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>

              {/* Right Side - AutoStart Switch & Action Button */}
              <div className="flex items-center gap-3">
                {!isEditMode && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="autostart-switch"
                      checked={autoStart}
                      onCheckedChange={setAutoStart}
                      disabled={isSubmitting}
                    />
                    <Label
                      htmlFor="autostart-switch"
                      className="text-sm cursor-pointer"
                    >
                      Start
                    </Label>
                  </div>
                )}

                {isEditMode ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !title.trim()}
                  >
                    {isSubmitting ? 'Updating...' : 'Update Task'}
                  </Button>
                ) : (
                  <Button
                    onClick={autoStart ? handleCreateAndStart : handleSubmit}
                    disabled={
                      isSubmitting ||
                      !title.trim() ||
                      (autoStart &&
                        (!selectedExecutorProfile || !selectedBranch))
                    }
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {isSubmitting ? 'Creating...' : 'Create'}
                  </Button>
                )}
              </div>
            </div>
          </TaskDialogContent>
        </TaskDialog>

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
