import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useDropzone } from 'react-dropzone';
import { useForm, useStore } from '@tanstack/react-form';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import BranchSelector from '@/components/tasks/BranchSelector';
import { ExecutorProfileSelector } from '@/components/settings';
import { useUserSystem } from '@/components/ConfigProvider';
import {
  useProjectBranches,
  useTaskImages,
  useImageUpload,
  useTaskMutations,
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
  TaskStatus,
  ExecutorProfileId,
  ImageResponse,
} from 'shared/types';

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export type TaskFormDialogProps =
  | { mode: 'create'; projectId: string }
  | { mode: 'edit'; projectId: string; task: Task }
  | { mode: 'duplicate'; projectId: string; initialTask: Task }
  | {
      mode: 'subtask';
      projectId: string;
      parentTaskAttemptId: string;
      initialBaseBranch: string;
    };

type TaskFormValues = {
  title: string;
  description: string;
  status: TaskStatus;
  executorProfileId: ExecutorProfileId | null;
  branch: string;
  autoStart: boolean;
};

const TaskFormDialogImpl = NiceModal.create<TaskFormDialogProps>((props) => {
  const { mode, projectId } = props;
  const editMode = mode === 'edit';
  const modal = useModal();
  const { t } = useTranslation(['tasks', 'common']);
  const { createTask, createAndStart, updateTask } =
    useTaskMutations(projectId);
  const { system, profiles, loading: userSystemLoading } = useUserSystem();
  const { upload, uploadForTask } = useImageUpload();
  const { enableScope, disableScope } = useHotkeysContext();

  // Local UI state
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const forceCreateOnlyRef = useRef(false);

  const { data: branches, isLoading: branchesLoading } =
    useProjectBranches(projectId);
  const { data: taskImages } = useTaskImages(
    editMode ? props.task.id : undefined
  );

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
        };

      case 'duplicate':
        return {
          title: props.initialTask.title,
          description: props.initialTask.description || '',
          status: 'todo',
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: true,
        };

      case 'subtask':
      case 'create':
      default:
        return {
          title: '',
          description: '',
          status: 'todo',
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
          autoStart: true,
        };
    }
  }, [mode, props, system.config?.executor_profile, branches]);

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
            parent_task_attempt: null,
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
        parent_task_attempt:
          mode === 'subtask' ? props.parentTaskAttemptId : null,
        image_ids: imageIds,
        shared_task_id: null,
      };
      const shouldAutoStart = value.autoStart && !forceCreateOnlyRef.current;
      if (shouldAutoStart) {
        await createAndStart.mutateAsync(
          {
            task,
            executor_profile_id: value.executorProfileId!,
            base_branch: value.branch,
          },
          { onSuccess: () => modal.remove() }
        );
      } else {
        await createTask.mutateAsync(task, { onSuccess: () => modal.remove() });
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

  const onDrop = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          // In edit mode, use uploadForTask to associate immediately
          // In create mode, use plain upload (will associate on task creation)
          const img = editMode
            ? await uploadForTask(props.task.id, file)
            : await upload(file);

          // Add markdown image reference to description
          const markdownText = `![${img.original_name}](${img.file_path})`;
          form.setFieldValue('description', (prev) =>
            prev.trim() === '' ? markdownText : `${prev} ${markdownText}`
          );
          setImages((prev) => [...prev, img]);
          setNewlyUploadedImageIds((prev) => [...prev, img.id]);
        } catch {
          // Silently ignore upload errors for now
        }
      }
    },
    [editMode, props, upload, uploadForTask, form]
  );

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

  // Compute localImages for WYSIWYG rendering of uploaded images
  const localImages: LocalImageMetadata[] = useMemo(
    () =>
      images.map((img) => ({
        path: img.file_path,
        proxy_url: `/api/images/${img.id}/file`,
        file_name: img.original_name,
        size_bytes: Number(img.size_bytes),
        format: img.mime_type?.split('/')[1] ?? 'png',
      })),
    [images]
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
        className="w-full max-w-[min(90vw,40rem)] max-h-[min(95vh,50rem)] flex flex-col overflow-hidden"
        uncloseable={showDiscardWarning}
      >
        <div
          {...getRootProps()}
          className="h-full flex flex-col gap-4 p-4 relative min-h-0"
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
          <div className="flex-none px-4 py-2 border border-1 border-border">
            <form.Field name="title">
              {(field) => (
                <Input
                  id="task-title"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={t('taskFormDialog.titlePlaceholder')}
                  className="text-lg font-semibold placeholder:text-muted-foreground/60 border-none p-0"
                  disabled={isSubmitting}
                  autoFocus
                />
              )}
            </form.Field>
          </div>

          <div className="flex-1 p-4 min-h-0 overflow-y-auto overscroll-contain space-y-1 border border-1 border-border">
            {/* Description */}
            <form.Field name="description">
              {(field) => (
                <WYSIWYGEditor
                  placeholder={t('taskFormDialog.descriptionPlaceholder')}
                  value={field.state.value}
                  onChange={(desc) => field.handleChange(desc)}
                  disabled={isSubmitting}
                  projectId={projectId}
                  onPasteFiles={onDrop}
                  className="border-none shadow-none px-0 text-md font-normal"
                  onCmdEnter={primaryAction}
                  onShiftCmdEnter={handleSubmitCreateOnly}
                  taskId={editMode ? props.task.id : undefined}
                  localImages={localImages}
                />
              )}
            </form.Field>
            {/* Edit mode status */}
            {editMode && (
              <form.Field name="status">
                {(field) => (
                  <div className="space-y-2">
                    <Label
                      htmlFor="task-status"
                      className="text-sm font-medium"
                    >
                      {t('taskFormDialog.statusLabel')}
                    </Label>
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
          </div>

          {/* Create mode dropdowns */}
          {!editMode && (
            <form.Field name="autoStart" mode="array">
              {(autoStartField) => (
                <div
                  className={cn(
                    'flex items-center gap-2 h-9 py-2 my-2 transition-opacity duration-200',
                    autoStartField.state.value
                      ? 'opacity-100'
                      : 'opacity-0 pointer-events-none'
                  )}
                >
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
                        onBranchSelect={(branch) => field.handleChange(branch)}
                        placeholder="Branch"
                        className={cn(
                          'h-9 flex-1 min-w-0 text-xs',
                          isSubmitting && 'opacity-50 cursor-not-allowed'
                        )}
                      />
                    )}
                  </form.Field>
                </div>
              )}
            </form.Field>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
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

            {/* Autostart switch */}
            <div className="flex items-center gap-3">
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
                      <Label
                        htmlFor="autostart-switch"
                        className="text-sm cursor-pointer"
                      >
                        {t('taskFormDialog.startLabel')}
                      </Label>
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
          <div className="relative z-[10000] grid w-full max-w-lg gap-4 bg-primary p-6 shadow-lg duration-200 sm:rounded-lg my-8">
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
