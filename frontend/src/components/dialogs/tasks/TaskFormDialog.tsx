import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useDropzone } from 'react-dropzone';
import { useForm, useStore } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label as FormLabel } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import {
  ImageUploadSection,
  type ImageUploadSectionHandle,
} from '@/components/ui/image-upload-section';
import BranchSelector from '@/components/tasks/BranchSelector';
import { ExecutorProfileSelector } from '@/components/settings';
import { VariableEditor } from '@/components/variables';
import { useUserSystem } from '@/components/ConfigProvider';
import {
  useProjectBranches,
  useTaskImages,
  useImageUpload,
  useTaskMutations,
  useTaskAttempts,
} from '@/hooks';
import {
  useKeySubmitTask,
  useKeySubmitTaskAlt,
  useKeyExit,
  Scope,
} from '@/keyboard';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { cn } from '@/lib/utils';
import type {
  Task,
  TaskStatus,
  ExecutorProfileId,
  ImageResponse,
  Label,
} from 'shared/types';
import { LabelSelect } from '@/components/labels';
import { labelsApi } from '@/lib/api';
import { useTaskLabels } from '@/hooks/useTaskLabels';
import { insertImageMarkdownAtPosition } from '@/utils/markdownImages';

export type TaskFormDialogProps =
  | { mode: 'create'; projectId: string }
  | { mode: 'edit'; projectId: string; task: Task }
  | { mode: 'duplicate'; projectId: string; initialTask: Task }
  | {
      mode: 'subtask';
      projectId: string;
      parentTaskId: string;
      initialBaseBranch?: string;
    };

type TaskFormValues = {
  title: string;
  description: string;
  status: TaskStatus;
  executorProfileId: ExecutorProfileId | null;
  branch: string;
  autoStart: boolean;
  useParentWorktree: boolean;
};

const TaskFormDialogImpl = NiceModal.create<TaskFormDialogProps>((props) => {
  const { mode, projectId } = props;
  const editMode = mode === 'edit';
  const modal = useModal();
  const { t } = useTranslation(['tasks', 'common']);
  const queryClient = useQueryClient();
  const { createTask, createAndStart, updateTask } =
    useTaskMutations(projectId);
  const { system, profiles, loading: userSystemLoading } = useUserSystem();
  const { upload, deleteImage } = useImageUpload();
  const { enableScope, disableScope } = useHotkeysContext();

  // Local UI state
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const imageUploadRef = useRef<ImageUploadSectionHandle>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const forceCreateOnlyRef = useRef(false);

  // Track insert position for pasted images (sequential insertion)
  const insertPositionRef = useRef<number>(0);

  const { data: branches, isLoading: branchesLoading } =
    useProjectBranches(projectId);
  const { data: taskImages } = useTaskImages(
    editMode ? props.task.id : undefined
  );

  // Parent task attempts - for "use parent worktree" option in subtask mode
  const parentTaskId = mode === 'subtask' ? props.parentTaskId : undefined;
  const { data: parentAttempts = [] } = useTaskAttempts(parentTaskId, {
    enabled: mode === 'subtask',
  });

  // Determine if parent worktree is available
  const parentWorktreeAvailable = useMemo(() => {
    if (parentAttempts.length === 0) return false;
    const latest = parentAttempts[0]; // Already sorted by created_at DESC
    if (!latest.container_ref) return false;
    if (latest.worktree_deleted) return false;
    return true;
  }, [parentAttempts]);

  // Labels management (for both create and edit modes)
  const taskId = editMode ? props.task.id : undefined;
  const { data: taskLabels } = useTaskLabels(taskId, editMode);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);

  // Sync labels from server to local state when data arrives (edit mode)
  useEffect(() => {
    if (taskLabels && taskLabels.length > 0) {
      // Single label mode - take the first label
      setSelectedLabel(taskLabels[0]);
    }
  }, [taskLabels]);

  // Get default form values based on mode
  const defaultValues = useMemo((): TaskFormValues => {
    const baseProfile = system.config?.executor_profile || null;

    const defaultBranch = (() => {
      if (!branches?.length) return '';
      if (
        mode === 'subtask' &&
        branches.some((b) => b.name === props.initialBaseBranch)
      ) {
        return props.initialBaseBranch;
      }
      // current branch or first branch
      const currentBranch = branches.find((b) => b.is_current);
      return currentBranch?.name || branches[0]?.name || '';
    })();

    switch (mode) {
      case 'edit':
        return {
          title: props.task.title,
          description: props.task.description || '',
          status: props.task.status,
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: false,
          useParentWorktree: false,
        };

      case 'duplicate':
        return {
          title: props.initialTask.title,
          description: props.initialTask.description || '',
          status: 'todo',
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: true,
          useParentWorktree: false,
        };

      case 'subtask':
        return {
          title: '',
          description: '',
          status: 'todo',
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: true,
          useParentWorktree: parentWorktreeAvailable,
        };

      case 'create':
      default:
        return {
          title: '',
          description: '',
          status: 'todo',
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: true,
          useParentWorktree: false,
        };
    }
  }, [
    mode,
    props,
    system.config?.executor_profile,
    branches,
    parentWorktreeAvailable,
  ]);

  // Form submission handler
  const handleSubmit = async ({ value }: { value: TaskFormValues }) => {
    if (editMode) {
      await updateTask.mutateAsync(
        {
          taskId: props.task.id,
          data: {
            title: value.title,
            description: value.description,
            status: value.status,
            parent_task_id: null,
            image_ids: images.length > 0 ? images.map((img) => img.id) : null,
          },
        },
        { onSuccess: () => modal.remove() }
      );
    } else {
      const imageIds =
        newlyUploadedImageIds.length > 0 ? newlyUploadedImageIds : null;
      const task = {
        project_id: projectId,
        title: value.title,
        description: value.description,
        status: null,
        parent_task_id: mode === 'subtask' ? props.parentTaskId : null,
        image_ids: imageIds,
        shared_task_id: null,
      };
      const shouldAutoStart = value.autoStart && !forceCreateOnlyRef.current;

      // Helper to set label after task creation
      const setLabelAfterCreate = async (createdTaskId: string) => {
        if (selectedLabel) {
          try {
            await labelsApi.setTaskLabels(createdTaskId, {
              label_ids: [selectedLabel.id],
            });
          } catch (err) {
            console.error('Failed to set label on new task:', err);
            // Don't block task creation if label assignment fails
          }
        }
      };

      if (shouldAutoStart) {
        await createAndStart.mutateAsync(
          {
            task,
            executor_profile_id: value.executorProfileId!,
            base_branch: value.branch,
            use_parent_worktree:
              mode === 'subtask' && value.useParentWorktree ? true : null,
          },
          {
            onSuccess: async (result) => {
              // TaskWithAttemptStatus has task fields directly (not nested)
              await setLabelAfterCreate(result.id);
              modal.remove();
            },
          }
        );
      } else {
        await createTask.mutateAsync(task, {
          onSuccess: async (createdTask) => {
            await setLabelAfterCreate(createdTask.id);
            modal.remove();
          },
        });
      }
    }
  };

  const validator = (value: TaskFormValues): string | undefined => {
    if (!value.title.trim().length) return 'need title';
    if (
      value.autoStart &&
      !forceCreateOnlyRef.current &&
      (!value.executorProfileId || !value.branch)
    ) {
      return 'need executor profile or branch;';
    }
  };

  // Initialize TanStack Form
  const form = useForm({
    defaultValues: defaultValues,
    onSubmit: handleSubmit,
    validators: {
      // we use an onMount validator so that the primary action button can
      // enable/disable itself based on `canSubmit`
      onMount: ({ value }) => validator(value),
      onChange: ({ value }) => validator(value),
    },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isDirty = useStore(form.store, (state) => state.isDirty);
  const canSubmit = useStore(form.store, (state) => state.canSubmit);

  // Load images for edit mode
  useEffect(() => {
    if (!taskImages) return;
    setImages(taskImages);
  }, [taskImages]);

  const onDrop = useCallback((files: File[]) => {
    if (imageUploadRef.current) {
      imageUploadRef.current.addFiles(files);
    } else {
      setPendingFiles(files);
    }
  }, []);

  // Handle paste with cursor position tracking
  const handlePasteFiles = useCallback(
    (files: File[], cursorPosition: number) => {
      insertPositionRef.current = cursorPosition;
      onDrop(files);
    },
    [onDrop]
  );

  // Track cursor position on selection change (for image button clicks)
  const handleSelectionChange = useCallback((cursorPosition: number) => {
    insertPositionRef.current = cursorPosition;
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: dropzoneOpen,
  } = useDropzone({
    onDrop: onDrop,
    accept: { 'image/*': [] },
    disabled: isSubmitting,
    noClick: true,
    noKeyboard: true,
  });

  // Apply pending files when ImageUploadSection becomes available
  useEffect(() => {
    if (pendingFiles && imageUploadRef.current) {
      imageUploadRef.current.addFiles(pendingFiles);
      setPendingFiles(null);
    }
  }, [pendingFiles]);

  // Image upload callback
  const handleImageUploaded = useCallback(
    (img: ImageResponse) => {
      form.setFieldValue('description', (prev) => {
        const { newText, newCursorPosition } = insertImageMarkdownAtPosition(
          prev,
          img,
          insertPositionRef.current
        );
        // Advance position for next image (sequential insertion)
        insertPositionRef.current = newCursorPosition;
        return newText;
      });
      setImages((prev) => [...prev, img]);
      setNewlyUploadedImageIds((prev) => [...prev, img.id]);
    },
    [form]
  );

  // Label change handler (for single label selection)
  const handleLabelChange = useCallback(
    async (newLabel: Label | null) => {
      setSelectedLabel(newLabel);

      // In edit mode, immediately save the label change to the server
      if (editMode && taskId) {
        try {
          await labelsApi.setTaskLabels(taskId, {
            label_ids: newLabel ? [newLabel.id] : [],
          });
          // Invalidate the task labels cache so TaskCard updates
          queryClient.invalidateQueries({ queryKey: ['taskLabels', taskId] });
        } catch (err) {
          console.error('Failed to update task label:', err);
          // Revert on error - restore from server data
          if (taskLabels && taskLabels.length > 0) {
            setSelectedLabel(taskLabels[0]);
          } else {
            setSelectedLabel(null);
          }
        }
      }
      // In create mode, just update local state - label will be saved after task creation
    },
    [editMode, taskId, taskLabels, queryClient]
  );

  // Unsaved changes detection
  const hasUnsavedChanges = useCallback(() => {
    if (isDirty) return true;
    if (newlyUploadedImageIds.length > 0) return true;
    if (images.length > 0 && !editMode) return true;
    return false;
  }, [isDirty, newlyUploadedImageIds, images, editMode]);

  // beforeunload listener
  useEffect(() => {
    if (!modal.visible || isSubmitting) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [modal.visible, isSubmitting, hasUnsavedChanges]);

  // Keyboard shortcuts
  const primaryAction = useCallback(() => {
    if (isSubmitting || !canSubmit) return;
    void form.handleSubmit();
  }, [form, isSubmitting, canSubmit]);

  const shortcutsEnabled =
    modal.visible && !isSubmitting && canSubmit && !showDiscardWarning;

  useKeySubmitTask(primaryAction, {
    enabled: shortcutsEnabled,
    scope: Scope.DIALOG,
    enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
    preventDefault: true,
  });

  const canSubmitAlt = useStore(
    form.store,
    (state) => state.values.title.trim().length > 0 && !state.isSubmitting
  );

  const handleSubmitCreateOnly = useCallback(() => {
    forceCreateOnlyRef.current = true;
    const promise = form.handleSubmit();
    Promise.resolve(promise).finally(() => {
      forceCreateOnlyRef.current = false;
    });
  }, [form]);

  useKeySubmitTaskAlt(handleSubmitCreateOnly, {
    enabled: modal.visible && canSubmitAlt && !showDiscardWarning,
    scope: Scope.DIALOG,
    enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
    preventDefault: true,
  });

  // Dialog close handling
  const handleDialogClose = (open: boolean) => {
    if (open) return;
    if (hasUnsavedChanges()) {
      setShowDiscardWarning(true);
    } else {
      modal.remove();
    }
  };

  const handleDiscardChanges = () => {
    form.reset();
    setImages([]);
    setNewlyUploadedImageIds([]);
    setShowDiscardWarning(false);
    modal.remove();
  };

  const handleContinueEditing = () => {
    setShowDiscardWarning(false);
  };

  // Manage CONFIRMATION scope when warning is shown
  useEffect(() => {
    if (showDiscardWarning) {
      disableScope(Scope.DIALOG);
      enableScope(Scope.CONFIRMATION);
    } else {
      disableScope(Scope.CONFIRMATION);
      enableScope(Scope.DIALOG);
    }
  }, [showDiscardWarning, enableScope, disableScope]);

  useKeyExit(handleContinueEditing, {
    scope: Scope.CONFIRMATION,
    when: () => modal.visible && showDiscardWarning,
  });

  const loading = branchesLoading || userSystemLoading;
  if (loading) return <></>;

  return (
    <>
      <Dialog
        open={modal.visible}
        onOpenChange={handleDialogClose}
        className="w-full max-w-[min(90vw,40rem)] max-h-[min(95vh,50rem)] flex flex-col overflow-hidden p-0"
        uncloseable={showDiscardWarning}
      >
        <div
          {...getRootProps()}
          className="h-full flex flex-col gap-0 px-4 pb-4 relative min-h-0"
        >
          <input {...getInputProps()} />
          {/* Drag overlay */}
          {isDragActive && (
            <div className="absolute inset-0 z-50 bg-primary/95 border-2 border-dashed border-primary-foreground/50 rounded-lg flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 text-primary-foreground" />
                <p className="text-lg font-medium text-primary-foreground">
                  {t('taskFormDialog.dropImagesHere')}
                </p>
              </div>
            </div>
          )}

          {/* Title */}
          <div className="flex-none pr-8 pt-3">
            <form.Field name="title">
              {(field) => (
                <Input
                  id="task-title"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={t('taskFormDialog.titlePlaceholder')}
                  className="text-lg font-medium border-none shadow-none px-0 placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  disabled={isSubmitting}
                  autoFocus
                />
              )}
            </form.Field>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1 pb-3">
            {/* Description */}
            <div>
              <form.Field name="description">
                {(field) => (
                  <FileSearchTextarea
                    value={field.state.value}
                    onChange={(desc) => field.handleChange(desc)}
                    rows={20}
                    maxRows={35}
                    placeholder={t('taskFormDialog.descriptionPlaceholder')}
                    className="border-none shadow-none px-0 resize-none placeholder:text-muted-foreground/60 focus-visible:ring-0 text-md font-normal"
                    disabled={isSubmitting}
                    projectId={projectId}
                    onPasteFiles={handlePasteFiles}
                    onSelectionChange={handleSelectionChange}
                    disableScroll={true}
                  />
                )}
              </form.Field>
            </div>

            {/* Images */}
            <ImageUploadSection
              ref={imageUploadRef}
              images={images}
              onImagesChange={setImages}
              onUpload={upload}
              onDelete={deleteImage}
              onImageUploaded={handleImageUploaded}
              disabled={isSubmitting}
              collapsible={false}
              defaultExpanded={true}
              hideDropZone={true}
            />

            {/* Edit mode status */}
            {editMode && (
              <form.Field name="status">
                {(field) => (
                  <div className="space-y-2">
                    <FormLabel
                      htmlFor="task-status"
                      className="text-sm font-medium"
                    >
                      {t('taskFormDialog.statusLabel')}
                    </FormLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value as TaskStatus)
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">
                          {t('taskFormDialog.statusOptions.todo')}
                        </SelectItem>
                        <SelectItem value="inprogress">
                          {t('taskFormDialog.statusOptions.inprogress')}
                        </SelectItem>
                        <SelectItem value="inreview">
                          {t('taskFormDialog.statusOptions.inreview')}
                        </SelectItem>
                        <SelectItem value="done">
                          {t('taskFormDialog.statusOptions.done')}
                        </SelectItem>
                        <SelectItem value="cancelled">
                          {t('taskFormDialog.statusOptions.cancelled')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            )}

            {/* Variables Editor - only in edit mode */}
            {editMode && (
              <div className="pt-4">
                <VariableEditor
                  taskId={props.task.id}
                  disabled={isSubmitting}
                  showInherited={true}
                  compact={true}
                />
              </div>
            )}
          </div>

          {/* Create mode dropdowns */}
          {!editMode && (
            <form.Field name="autoStart" mode="array">
              {(autoStartField) => (
                <div
                  className={cn(
                    'flex flex-col gap-2 py-2 my-2 transition-opacity duration-200',
                    autoStartField.state.value
                      ? 'opacity-100'
                      : 'opacity-0 pointer-events-none'
                  )}
                >
                  <div className="flex items-center gap-2 h-9">
                    <form.Field name="executorProfileId">
                      {(field) => (
                        <ExecutorProfileSelector
                          profiles={profiles}
                          selectedProfile={field.state.value}
                          onProfileSelect={(profile) =>
                            field.handleChange(profile)
                          }
                          disabled={isSubmitting || !autoStartField.state.value}
                          showLabel={false}
                          className="flex items-center gap-2 flex-row flex-[2] min-w-0"
                          itemClassName="flex-1 min-w-0"
                        />
                      )}
                    </form.Field>
                    <form.Field name="branch">
                      {(field) => (
                        <BranchSelector
                          branches={branches ?? []}
                          selectedBranch={field.state.value}
                          onBranchSelect={(branch) =>
                            field.handleChange(branch)
                          }
                          placeholder="Branch"
                          className={cn(
                            'h-9 flex-1 min-w-0 text-xs',
                            isSubmitting && 'opacity-50 cursor-not-allowed'
                          )}
                        />
                      )}
                    </form.Field>
                  </div>

                  {/* Use parent worktree checkbox - shown only in subtask mode */}
                  {mode === 'subtask' && (
                    <form.Field name="useParentWorktree">
                      {(field) => (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="use-parent-worktree"
                            checked={field.state.value}
                            onCheckedChange={(checked) =>
                              field.handleChange(checked === true)
                            }
                            disabled={
                              isSubmitting ||
                              !autoStartField.state.value ||
                              !parentWorktreeAvailable
                            }
                          />
                          <FormLabel
                            htmlFor="use-parent-worktree"
                            className={cn(
                              'text-sm cursor-pointer',
                              !parentWorktreeAvailable &&
                                'text-muted-foreground'
                            )}
                          >
                            {t(
                              'taskFormDialog.useParentWorktree',
                              'Use parent worktree'
                            )}
                          </FormLabel>
                        </div>
                      )}
                    </form.Field>
                  )}
                </div>
              )}
            </form.Field>
          )}

          {/* Actions */}
          <div className="border-t pt-3 flex items-center justify-between gap-3">
            {/* Attach Image*/}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={dropzoneOpen}
                className="h-9 w-9 p-0 rounded-none"
                aria-label={t('taskFormDialog.attachImage')}
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
            </div>

            {/* Label selector + Autostart switch + Create/Update button */}
            <div className="flex items-center gap-3">
              {/* Label selector */}
              <LabelSelect
                projectId={projectId}
                selectedLabel={selectedLabel}
                onLabelChange={handleLabelChange}
                disabled={isSubmitting}
              />

              {!editMode && (
                <form.Field name="autoStart">
                  {(field) => (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="autostart-switch"
                        checked={field.state.value}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked)
                        }
                        disabled={isSubmitting}
                        className="data-[state=checked]:bg-gray-900 dark:data-[state=checked]:bg-gray-100"
                        aria-label={t('taskFormDialog.startLabel')}
                      />
                      <FormLabel
                        htmlFor="autostart-switch"
                        className="text-sm cursor-pointer"
                      >
                        {t('taskFormDialog.startLabel')}
                      </FormLabel>
                    </div>
                  )}
                </form.Field>
              )}

              {/* Create/Start/Update button*/}
              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isSubmitting: state.isSubmitting,
                  values: state.values,
                })}
              >
                {({ canSubmit, isSubmitting, values }) => {
                  const buttonText = editMode
                    ? isSubmitting
                      ? t('taskFormDialog.updating')
                      : t('taskFormDialog.updateTask')
                    : isSubmitting
                      ? values.autoStart
                        ? t('taskFormDialog.starting')
                        : t('taskFormDialog.creating')
                      : t('taskFormDialog.create');

                  return (
                    <Button onClick={form.handleSubmit} disabled={!canSubmit}>
                      {buttonText}
                    </Button>
                  );
                }}
              </form.Subscribe>
            </div>
          </div>
        </div>
      </Dialog>
      {showDiscardWarning && (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowDiscardWarning(false)}
          />
          <div className="relative z-[10000] grid w-full max-w-lg gap-4 bg-background p-6 shadow-lg duration-200 sm:rounded-lg my-8">
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <DialogTitle>
                    {t('taskFormDialog.discardDialog.title')}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-left pt-2">
                  {t('taskFormDialog.discardDialog.description')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={handleContinueEditing}>
                  {t('taskFormDialog.discardDialog.continueEditing')}
                </Button>
                <Button variant="destructive" onClick={handleDiscardChanges}>
                  {t('taskFormDialog.discardDialog.discardChanges')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </div>
        </div>
      )}
    </>
  );
});

export const TaskFormDialog = defineModal<TaskFormDialogProps, void>(
  TaskFormDialogImpl
);
