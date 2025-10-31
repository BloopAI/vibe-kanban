import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useDropzone } from 'react-dropzone';
import { useForm, useStore } from '@tanstack/react-form';
import { Plus, Image as ImageIcon } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
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
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import {
  ImageUploadSection,
  type ImageUploadSectionHandle,
} from '@/components/ui/ImageUploadSection';
import BranchSelector from '@/components/tasks/BranchSelector';
import { ExecutorProfileSelector } from '@/components/settings';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useUserSystem } from '@/components/config-provider';
import {
  useProjectBranches,
  useTaskAttempt,
  useTaskImages,
  useImageUpload,
} from '@/hooks';
import { useKeySubmitTask, useKeyExit, Scope } from '@/keyboard';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { cn } from '@/lib/utils';
import type {
  TaskStatus,
  ExecutorProfileId,
  ImageResponse,
} from 'shared/types';
import { z } from 'zod';

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
};

export const TaskFormDialog = NiceModal.create<TaskFormDialogProps>((props) => {
  const { mode, projectId } = props;
  const modal = useModal();
  const { t } = useTranslation(['tasks', 'common']);
  const { createTask, createAndStart, updateTask } =
    useTaskMutations(projectId);
  const { system, profiles } = useUserSystem();
  const { upload, deleteImage } = useImageUpload();
  const { enableScope, disableScope } = useHotkeysContext();

  // Local UI state
  const [autoStart, setAutoStart] = useState(true);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);

  const imageUploadRef = useRef<ImageUploadSectionHandle>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: projectBranches } = useProjectBranches(projectId);
  const { data: parentAttempt } = useTaskAttempt(
    mode === 'subtask' ? props.parentTaskAttemptId : undefined
  );
  const { data: taskImages } = useTaskImages(
    mode === 'edit' ? props.task.id : undefined
  );

  // Derive branches and default branch selection
  const branches = useMemo(() => projectBranches ?? [], [projectBranches]);

  const defaultBranch = useMemo(() => {
    if (!branches.length) return '';
    const canFindBranch = (branch: string) =>
      branches.some((b) => b.name === branch);
    // initialBaseBranch prop (for subtask mode)
    if (mode === 'subtask') {
      if (canFindBranch(props.initialBaseBranch)) {
        return props.initialBaseBranch;
      }
      console.warn(
        "subtask initialBaseBranch doesn't match a stored branch: ",
        props.initialBaseBranch
      );
      // parent attempt branch
      const parentBranch =
        parentAttempt?.branch || parentAttempt?.target_branch;
      if (parentBranch && canFindBranch(parentBranch)) {
        return parentBranch;
      }
    }
    // current branch or first branch
    const currentBranch = branches.find((b) => b.is_current);
    return currentBranch?.name || branches[0]?.name || '';
  }, [branches, props, parentAttempt]);

  // Get default form values based on mode
  const getDefaultValues = useCallback((): TaskFormValues => {
    const baseProfile = system.config?.executor_profile || null;

    switch (mode) {
      case 'edit':
        return {
          title: props.task.title,
          description: props.task.description || '',
          status: props.task.status,
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
        };

      case 'duplicate':
        return {
          title: props.initialTask.title,
          description: props.initialTask.description || '',
          status: 'todo',
          executorProfileId: baseProfile,
          branch: defaultBranch || '',
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
        };
    }
  }, [mode, props, system.config?.executor_profile, defaultBranch]);

  // Form submission handler
  const handleSubmit = useCallback(
    async ({ value }: { value: TaskFormValues }) => {
      const imageIds =
        mode === 'edit'
          ? images.length > 0
            ? images.map((img) => img.id)
            : undefined
          : newlyUploadedImageIds.length > 0
            ? newlyUploadedImageIds
            : undefined;

      if (mode === 'edit') {
        await updateTask.mutateAsync(
          {
            taskId: props.task.id,
            data: {
              title: value.title,
              description: value.description,
              status: value.status,
              parent_task_attempt: null,
              image_ids: imageIds || null,
            },
          },
          { onSuccess: () => modal.remove() }
        );
      } else if (autoStart) {
        const finalProfile =
          value.executorProfileId || system.config?.executor_profile;
        if (!finalProfile || !value.branch) {
          console.warn('Missing executor profile or branch for Create & Start');
          return;
        }

        await createAndStart.mutateAsync(
          {
            task: {
              project_id: projectId,
              title: value.title,
              description: value.description,
              parent_task_attempt:
                mode === 'subtask' ? props.parentTaskAttemptId : null,
              image_ids: imageIds || null,
            },
            executor_profile_id: finalProfile,
            base_branch: value.branch,
          },
          { onSuccess: () => modal.remove() }
        );
      } else {
        await createTask.mutateAsync(
          {
            project_id: projectId,
            title: value.title,
            description: value.description,
            parent_task_attempt:
              mode === 'subtask' ? props.parentTaskAttemptId : null,
            image_ids: imageIds || null,
          },
          { onSuccess: () => modal.remove() }
        );
      }
    },
    [
      mode,
      props,
      autoStart,
      images,
      newlyUploadedImageIds,
      updateTask,
      createAndStart,
      createTask,
      system.config,
      modal,
      projectId,
    ]
  );

  // Initialize TanStack Form
  const form = useForm({
    defaultValues: getDefaultValues(),
    onSubmit: handleSubmit,
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  // Update branch when default branch changes
  useEffect(() => {
    if (!defaultBranch) return;
    if (mode !== 'edit') {
      form.setFieldValue('branch', defaultBranch, { dontUpdateMeta: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultBranch, mode]);

  // Load images for edit mode
  useEffect(() => {
    if (!taskImages) return;
    setImages(taskImages);
    setShowImageUpload(taskImages.length > 0);
  }, [taskImages]);

  // Drag & drop with react-dropzone
  const handleFiles = useCallback((files: File[]) => {
    setShowImageUpload(true);
    if (imageUploadRef.current) {
      imageUploadRef.current.addFiles(files);
    } else {
      setPendingFiles(files);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFiles,
    accept: { 'image/*': [] },
    disabled: form.state.isSubmitting,
    noClick: true,
    noKeyboard: true,
  });

  // Apply pending files when ImageUploadSection becomes available
  useEffect(() => {
    if (pendingFiles && imageUploadRef.current) {
      imageUploadRef.current.addFiles(pendingFiles);
      setPendingFiles(null);
    }
  }, [pendingFiles, showImageUpload]);

  // Image upload callback
  const handleImageUploaded = useCallback(
    (img: ImageResponse) => {
      const markdownText = `![${img.original_name}](${img.file_path})`;
      form.setFieldValue('description', (prev) =>
        prev.trim() === '' ? markdownText : `${prev} ${markdownText}`
      );
      setImages((prev) => [...prev, img]);
      setNewlyUploadedImageIds((prev) => [...prev, img.id]);
      setShowImageUpload(true);
    },
    [form]
  );

  // Unsaved changes detection
  const hasUnsavedChanges = useCallback(() => {
    if (form.state.isDirty) return true;
    if (newlyUploadedImageIds.length > 0) return true;
    if (images.length > 0 && mode !== 'edit') return true;
    return false;
  }, [form.state.isDirty, newlyUploadedImageIds, images, mode]);

  // beforeunload listener
  useEffect(() => {
    if (!modal.visible || form.state.isSubmitting) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [modal.visible, form.state.isSubmitting, hasUnsavedChanges]);

  // Keyboard shortcuts
  const primaryAction = useCallback(() => {
    if (form.state.isSubmitting || !form.state.canSubmit) return;
    void form.handleSubmit();
  }, [form]);

  const shortcutsEnabled =
    modal.visible &&
    !form.state.isSubmitting &&
    form.state.canSubmit &&
    !showDiscardWarning;

  useKeySubmitTask(primaryAction, {
    enabled: shortcutsEnabled,
    scope: Scope.DIALOG,
    enableOnFormTags: ['input', 'INPUT', 'textarea', 'TEXTAREA'],
    preventDefault: true,
  });

  // Dialog close handling
  const handleDialogClose = (open: boolean) => {
    if (!open && hasUnsavedChanges()) {
      setShowDiscardWarning(true);
    } else if (!open) {
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
                  Drop images here
                </p>
              </div>
            </div>
          )}

          {/* Title */}
          <div className="flex-none pr-8 pt-3">
            <form.Field
              name="title"
              validators={{ onChange: z.string().min(1) }}
            >
              {(field) => (
                <Input
                  id="task-title"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder={t('taskFormDialog.titlePlaceholder')}
                  className="text-lg font-medium border-none shadow-none px-0 placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  disabled={form.state.isSubmitting}
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
                    onBlur={field.handleBlur}
                    rows={20}
                    maxRows={35}
                    placeholder={t('taskFormDialog.descriptionPlaceholder')}
                    className="border-none shadow-none px-0 resize-none placeholder:text-muted-foreground/60 focus-visible:ring-0 text-md font-normal"
                    disabled={isSubmitting}
                    projectId={projectId}
                    onPasteFiles={handleFiles}
                    disableScroll={true}
                  />
                )}
              </form.Field>
            </div>

            {/* Images */}
            {showImageUpload && (
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
            )}

            {/* Edit mode status */}
            {mode === 'edit' && (
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
          {mode !== 'edit' && (
            <div
              className={cn(
                'flex items-center gap-2 h-9 py-2 my-2 transition-opacity duration-200',
                autoStart ? 'opacity-100' : 'opacity-0 pointer-events-none'
              )}
            >
              <form.Field name="executorProfileId">
                {(field) => (
                  <ExecutorProfileSelector
                    profiles={profiles}
                    selectedProfile={field.state.value}
                    onProfileSelect={(profile) => field.handleChange(profile)}
                    disabled={isSubmitting || !autoStart}
                    showLabel={false}
                    className="flex items-center gap-2 flex-row flex-[2] min-w-0"
                    itemClassName="flex-1 min-w-0"
                  />
                )}
              </form.Field>
              <form.Field name="branch">
                {(field) => (
                  <BranchSelector
                    branches={branches}
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

          {/* Actions */}
          <div className="border-t pt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 w-9 p-0 rounded-none"
                aria-label={t('taskFormDialog.attachImage')}
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files) {
                    handleFiles(Array.from(e.target.files));
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
            </div>

            <div className="flex items-center gap-3">
              {mode !== 'edit' && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="autostart-switch"
                    checked={autoStart}
                    onCheckedChange={setAutoStart}
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

              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isSubmitting: state.isSubmitting,
                  values: state.values,
                })}
              >
                {(state) => {
                  const isDisabled =
                    !state.canSubmit ||
                    !state.values.title.trim() ||
                    (mode !== 'edit' &&
                      autoStart &&
                      (!state.values.executorProfileId ||
                        !state.values.branch));

                  return mode === 'edit' ? (
                    <Button
                      onClick={() => form.handleSubmit()}
                      disabled={isDisabled}
                    >
                      {state.isSubmitting
                        ? t('taskFormDialog.updating')
                        : t('taskFormDialog.updateTask')}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => form.handleSubmit()}
                      disabled={isDisabled}
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      {state.isSubmitting
                        ? autoStart
                          ? t('taskFormDialog.starting')
                          : t('taskFormDialog.creating')
                        : t('taskFormDialog.create')}
                    </Button>
                  );
                }}
              </form.Subscribe>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Discard warning dialog - rendered inline without scope management */}
      {showDiscardWarning && (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowDiscardWarning(false)}
          />
          <div className="relative z-[10000] grid w-full max-w-lg gap-4 bg-primary p-6 shadow-lg duration-200 sm:rounded-lg my-8">
            <div className="flex flex-col space-y-1.5 text-center sm:text-left">
              <h3 className="text-lg font-semibold leading-none tracking-tight">
                {t('taskFormDialog.discardDialog.title')}
              </h3>
            </div>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                {t('taskFormDialog.discardDialog.description')}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleContinueEditing}>
                {t('taskFormDialog.discardDialog.continueEditing')}
              </Button>
              <Button variant="destructive" onClick={handleDiscardChanges}>
                {t('taskFormDialog.discardDialog.discardChanges')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
