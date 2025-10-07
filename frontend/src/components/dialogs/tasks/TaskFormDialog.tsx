import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from 'react';
import type { ReactNode } from 'react';
import { Settings2, ArrowDown, Plus, Play, Image } from 'lucide-react';
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

// Fixed Collapse component that doesn't remount and animates properly in both directions
function Collapse({
  open,
  children,
  className = '',
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'height') return;
      if (open) {
        // Allow natural growth after expand completes
        el.style.height = 'auto';
      }
      el.removeEventListener('transitionend', onEnd);
    };

    // First render: set height without animating to avoid flashes
    if (!mounted.current) {
      el.style.height = open ? 'auto' : '0px';
      mounted.current = true;
      return;
    }

    // For expand: from 0 → scrollHeight; then set to 'auto' on end
    // For collapse: from current scrollHeight → 0
    const start = open ? 0 : el.scrollHeight;
    const end = open ? el.scrollHeight : 0;

    // Set starting height
    el.style.height = `${start}px`;
    // Force reflow so the browser picks up the starting value
    el.getBoundingClientRect();
    // Animate to target height
    el.style.height = `${end}px`;
    el.addEventListener('transitionend', onEnd);

    return () => el.removeEventListener('transitionend', onEnd);
  }, [open]);

  return (
    <div
      ref={ref}
      className={`overflow-hidden transition-[height,opacity] duration-300 ease-out ${
        open ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

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
    const [isSubmittingAndStart, setIsSubmittingAndStart] = useState(false);
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
    const [shouldStart, setShouldStart] = useState(true);
    const imageUploadRef = useRef<ImageUploadSectionHandle>(null);
    const [isTextareaFocused, setIsTextareaFocused] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Set default executor from config and ensure it matches available options
    useEffect(() => {
      if (system.config?.executor_profile && profiles) {
        const configProfile = system.config.executor_profile;

        // Generate options to find matching one
        const options: Array<{
          id: string;
          executorProfile: ExecutorProfileId;
        }> = [];

        Object.entries(profiles).forEach(([agentKey, configs]) => {
          const agent = agentKey as BaseCodingAgent;

          if (Object.keys(configs).length === 0) {
            options.push({
              id: `${agent}:default`,
              executorProfile: { executor: agent, variant: null },
            });
          } else {
            Object.keys(configs).forEach((variant) => {
              options.push({
                id: `${agent}:${variant}`,
                executorProfile: { executor: agent, variant },
              });
            });
          }
        });

        // Find matching option using normalized variant key
        const expectedId = `${configProfile.executor}:${getVariantKeyForId(configProfile)}`;
        const matchingOption = options.find((opt) => opt.id === expectedId);

        if (matchingOption) {
          setSelectedExecutorProfile(matchingOption.executorProfile);
        } else {
          // Fallback: set the config profile anyway
          setSelectedExecutorProfile(configProfile);
        }
      }
    }, [system.config?.executor_profile, profiles]);

    // Helper to normalize variant keys for consistent ID generation
    const getVariantKeyForId = (profile: ExecutorProfileId): string => {
      const agent = profile.executor;
      const configs = profiles?.[agent];
      // No variants → use our sentinel 'default'
      if (!configs || Object.keys(configs).length === 0) return 'default';
      // Explicit variant provided → use it as-is
      if (profile.variant) return profile.variant;
      // No explicit variant, but variants exist → prefer 'DEFAULT' if present, else first key
      const keys = Object.keys(configs);
      const defaultKey = keys.find((k) => k.toUpperCase() === 'DEFAULT');
      return defaultKey ?? keys[0];
    };

    // Create combined agent+config options for the flattened selector
    const getAgentConfigOptions = () => {
      if (!profiles) return [];

      const options: Array<{
        id: string;
        label: string;
        executorProfile: ExecutorProfileId;
      }> = [];

      Object.entries(profiles).forEach(([agentKey, configs]) => {
        const agent = agentKey as BaseCodingAgent;

        if (Object.keys(configs).length === 0) {
          // Agent with no variants - just default
          options.push({
            id: `${agent}:default`,
            label: agent,
            executorProfile: { executor: agent, variant: null },
          });
        } else {
          // Agent with variants
          Object.keys(configs).forEach((variant) => {
            options.push({
              id: `${agent}:${variant}`,
              label: `${agent} (${variant})`,
              executorProfile: { executor: agent, variant },
            });
          });
        }
      });

      return options.sort((a, b) => a.label.localeCompare(b.label));
    };

    // Get the current agent config option ID for the Select value
    const getCurrentAgentConfigId = () => {
      if (!selectedExecutorProfile) return '';
      // Use normalized variant key for consistent matching
      const variantKey = getVariantKeyForId(selectedExecutorProfile);
      return `${selectedExecutorProfile.executor}:${variantKey}`;
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

    const handleSubmit = useCallback(async () => {
      if (!title.trim() || !projectId || isSubmitting || isSubmittingAndStart) {
        return;
      }

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
      isSubmittingAndStart,
      parentTaskAttemptId,
    ]);

    const handleCreateAndStart = useCallback(async () => {
      if (
        !title.trim() ||
        !projectId ||
        isEditMode ||
        isSubmitting ||
        isSubmittingAndStart
      ) {
        return;
      }

      setIsSubmittingAndStart(true);
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
      isSubmitting,
      isSubmittingAndStart,
      parentTaskAttemptId,
    ]);

    const handleDiscardChanges = useCallback(() => {
      // Close both dialogs
      setShowDiscardWarning(false);
      modal.hide();
    }, [modal]);

    // Handle keyboard shortcuts
    const primaryAction = useCallback(() => {
      if (isSubmitting || isSubmittingAndStart || !title.trim()) return;
      if (isEditMode) {
        void handleSubmit();
        return;
      }
      if (shouldStart) {
        void handleCreateAndStart();
      } else {
        void handleSubmit();
      }
    }, [isSubmitting, isSubmittingAndStart, title, isEditMode, shouldStart, handleSubmit, handleCreateAndStart]);

    const alternateAction = useCallback(() => {
      if (isSubmitting || isSubmittingAndStart || !title.trim()) return;
      if (isEditMode) {
        void handleSubmit();
        return;
      }
      // Alternate = opposite of primary in create mode
      if (shouldStart) {
        void handleSubmit(); // create only
      } else {
        void handleCreateAndStart(); // create and start
      }
    }, [isSubmitting, isSubmittingAndStart, title, isEditMode, shouldStart, handleSubmit, handleCreateAndStart]);

    const shortcutsEnabled =
      modal.visible && !isSubmitting && !isSubmittingAndStart && !!title.trim() && isTextareaFocused;

    useKeySubmitTask(primaryAction, { 
      enabled: shortcutsEnabled, 
      scope: Scope.DIALOG,
      enableOnFormTags: ['textarea', 'TEXTAREA'],
      preventDefault: true,
    });
    useKeySubmitTaskAlt(alternateAction, { 
      enabled: shortcutsEnabled, 
      scope: Scope.DIALOG,
      enableOnFormTags: ['textarea', 'TEXTAREA'],
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

    // Agent selector component similar to BranchSelector
    const AgentSelector = ({ className = '' }: { className?: string }) => {
      const agentOptions = getAgentConfigOptions();
      const currentId = getCurrentAgentConfigId();
      const selectedOption = agentOptions.find((opt) => opt.id === currentId);

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`w-full justify-between text-xs ${className}`}
              disabled={isSubmitting || isSubmittingAndStart}
            >
              <div className="flex items-center gap-1.5 w-full">
                <Settings2 className="h-3 w-3" />
                <span className="truncate">
                  {selectedOption?.label || 'Agent'}
                </span>
              </div>
              <ArrowDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            {agentOptions.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No agents available
              </div>
            ) : (
              agentOptions.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onClick={() =>
                    setSelectedExecutorProfile(option.executorProfile)
                  }
                  className={
                    selectedOption?.id === option.id ? 'bg-accent' : ''
                  }
                >
                  {option.label}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    };

    // Single action button with segmented control
    const CreateActionButton = () => {
      const mode = shouldStart ? 'start' : 'create';
      const isLoading = shouldStart ? isSubmittingAndStart : isSubmitting;
      const isDisabled = isSubmitting || isSubmittingAndStart || !title.trim();

      const handleSegmentClick = (newMode: 'create' | 'start') => {
        if (isDisabled) return;

        if (newMode === mode) {
          // Second click on same mode - execute action
          if (newMode === 'start') {
            handleCreateAndStart();
          } else {
            handleSubmit();
          }
        } else {
          // First click - just change mode
          setShouldStart(newMode === 'start');
        }
      };

      return (
        <div className="flex flex-col gap-3">
          {/* Segmented Control Button */}
          <div className="relative border border-input bg-background p-1 flex min-w-[180px]">
            {/* Sliding Background/Highlight */}
            <div
              className={`absolute top-1 bottom-1 w-[calc(50%-2px)] bg-primary border border-primary  transition-all duration-200 ease-out ${
                shouldStart ? 'right-1' : 'left-1'
              }`}
            />

            {/* Create Segment */}
            <button
              type="button"
              onClick={() => handleSegmentClick('create')}
              disabled={isDisabled}
              className={`relative z-20 flex-1 py-2 px-4 text-sm font-medium transition-colors duration-200 rounded-sm ${
                isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              } ${
                !shouldStart
                  ? 'text-primary-foreground'
                  : 'text-foreground hover:text-primary'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Plus className="h-3 w-3" />
                {!shouldStart && isLoading ? 'Creating...' : 'Create'}
              </div>
            </button>

            {/* Start Segment */}
            <button
              type="button"
              onClick={() => handleSegmentClick('start')}
              disabled={isDisabled}
              className={`relative z-20 flex-1 py-2 px-4 text-sm font-medium transition-colors duration-200 rounded-sm ${
                isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              } ${
                shouldStart
                  ? 'text-primary-foreground'
                  : 'text-foreground hover:text-primary'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Play className="h-3 w-3 fill-current" />
                {shouldStart && isLoading ? 'Starting...' : 'Start'}
              </div>
            </button>
          </div>
        </div>
      );
    };

    return (
      <>
        <Dialog
          open={modal.visible}
          onOpenChange={handleDialogOpenChange}
          className="w-full max-w-[min(90vw,40rem)] max-h-[min(95vh,50rem)]"
        >
          <DialogContent className="h-full overflow-hidden flex flex-col gap-0 p-4 pb-0">
            <div className="flex-1 overflow-y-auto space-y-4 px-0">
              {/* Title Input */}
              <div>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task title"
                  className="text-lg font-medium border-none shadow-none px-0 placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  disabled={isSubmitting || isSubmittingAndStart}
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
                  disabled={isSubmitting || isSubmittingAndStart}
                  projectId={projectId}
                  onPasteFiles={handlePasteImages}
                  onFocus={() => setIsTextareaFocused(true)}
                  onBlur={() => setIsTextareaFocused(false)}
                />
              </div>

              {/* Image Upload Section */}
              <Collapse open={showImageUpload}>
                <ImageUploadSection
                  ref={imageUploadRef}
                  images={images}
                  onImagesChange={handleImagesChange}
                  onUpload={imagesApi.upload}
                  onDelete={imagesApi.delete}
                  onImageUploaded={handleImageUploaded}
                  disabled={isSubmitting || isSubmittingAndStart}
                  readOnly={isEditMode}
                  collapsible={false}
                  defaultExpanded={true}
                  hideDropZone={true}
                />
              </Collapse>

              {/* Status Selector (Edit Mode Only) */}
              {isEditMode && (
                <div className="space-y-2">
                  <Label htmlFor="task-status" className="text-sm font-medium">
                    Status
                  </Label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as TaskStatus)}
                    disabled={isSubmitting || isSubmittingAndStart}
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
            </div>

            {/* Bottom Action Bar */}
            <div className="border-t pt-4 px-0 flex items-center justify-between gap-3">
              {/* Left Side - Paperclip, Agent & Branch Selectors */}
              <div className="flex items-center gap-2">
                {/* Image Attach Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFileSelect}
                  className="h-9 w-9 p-0 rounded-none"
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

                {/* Agent & Branch Selectors with Fade Transition */}
                <div
                  className={`transition-all duration-300 ease-out ${
                    !isEditMode && shouldStart
                      ? 'opacity-100 max-w-80 overflow-visible'
                      : 'opacity-0 max-w-0 overflow-hidden'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Combined Agent Selector */}
                    {profiles && <AgentSelector className="h-9 w-32" />}

                    {/* Branch Selector */}
                    {branches.length > 0 && (
                      <BranchSelector
                        branches={branches}
                        selectedBranch={selectedBranch}
                        onBranchSelect={setSelectedBranch}
                        placeholder="Branch"
                        className={`h-9 w-32 text-xs ${
                          isSubmitting || isSubmittingAndStart
                            ? 'opacity-50 cursor-not-allowed'
                            : ''
                        }`}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side - Action Buttons */}
              <div className="flex items-center gap-2">
                {isEditMode ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !title.trim()}
                  >
                    {isSubmitting ? 'Updating...' : 'Update Task'}
                  </Button>
                ) : (
                  <CreateActionButton />
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
