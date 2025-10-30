import {
  useEffect,
  useCallback,
  useRef,
  useReducer,
  useState,
  useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useDropzone } from 'react-dropzone';
import { Plus, Image as ImageIcon } from 'lucide-react';
import { TaskDialog } from './TaskDialog';
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

type State = {
  title: string;
  description: string;
  status: TaskStatus;
  autoStart: boolean;
  selectedExecutorProfile: ExecutorProfileId | null;
  selectedBranch: string;
  images: ImageResponse[];
  showImageUpload: boolean;
  newlyUploadedImageIds: string[];
  isSubmitting: boolean;
  showDiscardWarning: boolean;
};

type Action =
  | { type: 'set_title'; payload: string }
  | { type: 'set_description'; payload: string }
  | { type: 'set_status'; payload: TaskStatus }
  | { type: 'set_auto_start'; payload: boolean }
  | { type: 'set_profile'; payload: ExecutorProfileId | null }
  | { type: 'set_branch'; payload: string }
  | { type: 'set_images'; payload: ImageResponse[] }
  | { type: 'add_uploaded_id'; payload: string }
  | { type: 'set_show_upload'; payload: boolean }
  | { type: 'set_submitting'; payload: boolean }
  | { type: 'set_discard'; payload: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set_title':
      return { ...state, title: action.payload };
    case 'set_description':
      return { ...state, description: action.payload };
    case 'set_status':
      return { ...state, status: action.payload };
    case 'set_auto_start':
      return { ...state, autoStart: action.payload };
    case 'set_profile':
      return { ...state, selectedExecutorProfile: action.payload };
    case 'set_branch':
      return { ...state, selectedBranch: action.payload };
    case 'set_images':
      return { ...state, images: action.payload };
    case 'add_uploaded_id':
      return {
        ...state,
        newlyUploadedImageIds: [...state.newlyUploadedImageIds, action.payload],
      };
    case 'set_show_upload':
      return { ...state, showImageUpload: action.payload };
    case 'set_submitting':
      return { ...state, isSubmitting: action.payload };
    case 'set_discard':
      return { ...state, showDiscardWarning: action.payload };
    default:
      return state;
  }
}

const initialState: State = {
  title: '',
  description: '',
  status: 'todo',
  autoStart: true,
  selectedExecutorProfile: null,
  selectedBranch: '',
  images: [],
  showImageUpload: false,
  newlyUploadedImageIds: [],
  isSubmitting: false,
  showDiscardWarning: false,
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

  const reset = (initialState: State): State => {
    return {
      ...initialState,
      selectedExecutorProfile: system.config?.executor_profile || null,
    };
  };

  const init = (initialState: State): State => {
    switch (mode) {
      case 'edit':
        return {
          ...initialState,
          title: props.task.title,
          description: props.task.description || '',
          status: props.task.status,
        };
      case 'duplicate':
        return {
          ...initialState,
          title: props.initialTask.title,
          description: props.initialTask.description || '',
          status: 'todo',
          selectedExecutorProfile: system.config?.executor_profile || null,
        };
      case 'subtask':
      case 'create':
        return reset(initialState);
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState, init);
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

  // Update state when default branch changes
  useEffect(() => {
    if (!defaultBranch) return;
    dispatch({ type: 'set_branch', payload: defaultBranch });
  }, [defaultBranch]);

  // Load images for edit mode
  useEffect(() => {
    if (!taskImages) return;
    dispatch({ type: 'set_images', payload: taskImages });
    dispatch({ type: 'set_show_upload', payload: taskImages.length > 0 });
  }, [taskImages]);

  // Drag & drop with react-dropzone
  const handleFiles = useCallback((files: File[]) => {
    dispatch({ type: 'set_show_upload', payload: true });
    if (imageUploadRef.current) {
      imageUploadRef.current.addFiles(files);
    } else {
      setPendingFiles(files);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFiles,
    accept: { 'image/*': [] },
    disabled: state.isSubmitting,
    noClick: true,
    noKeyboard: true,
  });

  // Apply pending files when ImageUploadSection becomes available
  useEffect(() => {
    if (pendingFiles && imageUploadRef.current) {
      imageUploadRef.current.addFiles(pendingFiles);
      setPendingFiles(null);
    }
  }, [pendingFiles, state.showImageUpload]);

  // Unsaved changes detection
  const hasUnsavedChanges = useCallback(() => {
    if (mode === 'edit') {
      return (
        state.title.trim() !== props.task.title.trim() ||
        (state.description || '').trim() !==
          (props.task.description || '').trim() ||
        state.status !== props.task.status
      );
    }
    return state.title.trim() !== '' || state.description.trim() !== '';
  }, [props, state.title, state.description, state.status]);

  // beforeunload listener
  useEffect(() => {
    if (!modal.visible || state.isSubmitting) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [modal.visible, state.isSubmitting, hasUnsavedChanges]);

  // Submission handlers
  const submit = useCallback(async () => {
    if (!state.title.trim() || state.isSubmitting) return;

    dispatch({ type: 'set_submitting', payload: true });
    try {
      const imageIds =
        mode === 'edit'
          ? state.images.length > 0
            ? state.images.map((img) => img.id)
            : undefined
          : state.newlyUploadedImageIds.length > 0
            ? state.newlyUploadedImageIds
            : undefined;

      if (mode === 'edit') {
        await updateTask.mutateAsync(
          {
            taskId: props.task.id,
            data: {
              title: state.title,
              description: state.description,
              status: state.status,
              parent_task_attempt: null,
              image_ids: imageIds || null,
            },
          },
          { onSuccess: () => modal.remove() }
        );
      } else {
        await createTask.mutateAsync(
          {
            project_id: projectId,
            title: state.title,
            description: state.description,
            parent_task_attempt:
              mode === 'subtask' ? props.parentTaskAttemptId : null,
            image_ids: imageIds || null,
          },
          { onSuccess: () => modal.remove() }
        );
      }
    } finally {
      dispatch({ type: 'set_submitting', payload: false });
    }
  }, [state, props, createTask, updateTask, modal]);

  const handleCreateAndStart = useCallback(async () => {
    if (!state.title.trim() || mode === 'edit' || state.isSubmitting) return;

    dispatch({ type: 'set_submitting', payload: true });
    try {
      const finalProfile =
        state.selectedExecutorProfile || system.config?.executor_profile;
      if (!finalProfile || !state.selectedBranch) {
        console.warn('Missing executor profile or branch for Create & Start');
        return;
      }

      const imageIds =
        state.newlyUploadedImageIds.length > 0
          ? state.newlyUploadedImageIds
          : undefined;

      await createAndStart.mutateAsync(
        {
          task: {
            project_id: projectId,
            title: state.title,
            description: state.description,
            parent_task_attempt:
              mode === 'subtask' ? props.parentTaskAttemptId : null,
            image_ids: imageIds || null,
          },
          executor_profile_id: finalProfile,
          base_branch: state.selectedBranch,
        },
        { onSuccess: () => modal.remove() }
      );
    } finally {
      dispatch({ type: 'set_submitting', payload: false });
    }
  }, [state, props, createAndStart, system.config, modal]);

  // Keyboard shortcuts
  const primaryAction = useCallback(() => {
    if (state.isSubmitting || !state.title.trim()) return;

    if (mode === 'edit') {
      void submit();
    } else if (state.autoStart) {
      void handleCreateAndStart();
    } else {
      void submit();
    }
  }, [
    state.isSubmitting,
    state.title,
    state.autoStart,
    mode,
    submit,
    handleCreateAndStart,
  ]);

  const alternateAction = useCallback(() => {
    if (state.isSubmitting || !state.title.trim()) return;

    if (mode === 'edit') {
      void submit();
    } else if (state.autoStart) {
      void submit();
    } else {
      void handleCreateAndStart();
    }
  }, [
    state.isSubmitting,
    state.title,
    state.autoStart,
    mode,
    submit,
    handleCreateAndStart,
  ]);

  const shortcutsEnabled =
    modal.visible &&
    !state.isSubmitting &&
    !!state.title.trim() &&
    !state.showDiscardWarning;

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

  // Dialog close handling
  const handleDialogClose = (open: boolean) => {
    if (!open && hasUnsavedChanges()) {
      dispatch({ type: 'set_discard', payload: true });
    } else if (!open) {
      modal.remove();
    }
  };

  const handleDiscardChanges = () => {
    modal.remove();
  };

  const handleContinueEditing = () => {
    dispatch({ type: 'set_discard', payload: false });
  };

  // Manage CONFIRMATION scope when warning is shown
  useEffect(() => {
    if (state.showDiscardWarning) {
      disableScope(Scope.DIALOG);
      enableScope(Scope.CONFIRMATION);
    } else {
      disableScope(Scope.CONFIRMATION);
      enableScope(Scope.DIALOG);
    }
  }, [state.showDiscardWarning, enableScope, disableScope]);

  useKeyExit(handleContinueEditing, {
    scope: Scope.CONFIRMATION,
    when: () => modal.visible && state.showDiscardWarning,
  });

  return (
    <>
      <TaskDialog
        open={modal.visible}
        onOpenChange={handleDialogClose}
        className="w-full max-w-[min(90vw,40rem)] max-h-[min(95vh,50rem)] flex flex-col overflow-hidden"
        uncloseable={state.showDiscardWarning}
        ariaLabel={mode === 'edit' ? 'Edit task' : 'Create new task'}
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
            <Input
              id="task-title"
              value={state.title}
              onChange={(e) =>
                dispatch({ type: 'set_title', payload: e.target.value })
              }
              placeholder={t('taskFormDialog.titlePlaceholder')}
              className="text-lg font-medium border-none shadow-none px-0 placeholder:text-muted-foreground/60 focus-visible:ring-0"
              disabled={state.isSubmitting}
              autoFocus
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1 pb-3">
            {/* Description */}
            <div>
              <FileSearchTextarea
                value={state.description}
                onChange={(desc) =>
                  dispatch({ type: 'set_description', payload: desc })
                }
                rows={20}
                maxRows={35}
                placeholder={t('taskFormDialog.descriptionPlaceholder')}
                className="border-none shadow-none px-0 resize-none placeholder:text-muted-foreground/60 focus-visible:ring-0 text-md font-normal"
                disabled={state.isSubmitting}
                projectId={projectId}
                onPasteFiles={handleFiles}
                disableScroll={true}
              />
            </div>

            {/* Images */}
            {state.showImageUpload && (
              <ImageUploadSection
                ref={imageUploadRef}
                images={state.images}
                onImagesChange={(imgs) =>
                  dispatch({ type: 'set_images', payload: imgs })
                }
                onUpload={upload}
                onDelete={deleteImage}
                onImageUploaded={(img) => {
                  const markdownText = `![${img.original_name}](${img.file_path})`;
                  const newDescription =
                    state.description.trim() === ''
                      ? markdownText
                      : state.description + ' ' + markdownText;
                  dispatch({
                    type: 'set_description',
                    payload: newDescription,
                  });
                  dispatch({
                    type: 'set_images',
                    payload: [...state.images, img],
                  });
                  dispatch({ type: 'set_show_upload', payload: true });
                  dispatch({ type: 'add_uploaded_id', payload: img.id });
                }}
                disabled={state.isSubmitting}
                collapsible={false}
                defaultExpanded={true}
                hideDropZone={true}
              />
            )}

            {/* Edit mode status */}
            {mode === 'edit' && (
              <div className="space-y-2">
                <Label htmlFor="task-status" className="text-sm font-medium">
                  {t('taskFormDialog.statusLabel')}
                </Label>
                <Select
                  value={state.status}
                  onValueChange={(value) =>
                    dispatch({
                      type: 'set_status',
                      payload: value as TaskStatus,
                    })
                  }
                  disabled={state.isSubmitting}
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
          </div>

          {/* Create mode dropdowns */}
          {mode !== 'edit' && (
            <div
              className={cn(
                'flex items-center gap-2 h-9 py-2 my-2 transition-opacity duration-200',
                state.autoStart
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
              )}
            >
              <ExecutorProfileSelector
                profiles={profiles}
                selectedProfile={state.selectedExecutorProfile}
                onProfileSelect={(profile) =>
                  dispatch({ type: 'set_profile', payload: profile })
                }
                disabled={state.isSubmitting}
                showLabel={false}
                className="flex items-center gap-2 flex-row flex-[2] min-w-0"
                itemClassName="flex-1 min-w-0"
              />
              <BranchSelector
                branches={branches}
                selectedBranch={state.selectedBranch}
                onBranchSelect={(branch) =>
                  dispatch({ type: 'set_branch', payload: branch })
                }
                placeholder="Branch"
                className={cn(
                  'h-9 flex-1 min-w-0 text-xs',
                  state.isSubmitting && 'opacity-50 cursor-not-allowed'
                )}
              />
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
                    checked={state.autoStart}
                    onCheckedChange={(checked) =>
                      dispatch({ type: 'set_auto_start', payload: checked })
                    }
                    disabled={state.isSubmitting}
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

              {mode === 'edit' ? (
                <Button
                  onClick={submit}
                  disabled={state.isSubmitting || !state.title.trim()}
                >
                  {state.isSubmitting
                    ? t('taskFormDialog.updating')
                    : t('taskFormDialog.updateTask')}
                </Button>
              ) : (
                <Button
                  onClick={state.autoStart ? handleCreateAndStart : submit}
                  disabled={
                    state.isSubmitting ||
                    !state.title.trim() ||
                    (state.autoStart &&
                      (!state.selectedExecutorProfile || !state.selectedBranch))
                  }
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  {state.isSubmitting
                    ? state.autoStart
                      ? t('taskFormDialog.starting')
                      : t('taskFormDialog.creating')
                    : t('taskFormDialog.create')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </TaskDialog>

      {/* Discard warning dialog - rendered inline without scope management */}
      {state.showDiscardWarning && (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => dispatch({ type: 'set_discard', payload: false })}
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
