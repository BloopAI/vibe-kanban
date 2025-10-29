import { useEffect, useCallback, useRef, useReducer, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import {
  ImageUploadSection,
  type ImageUploadSectionHandle,
} from '@/components/ui/ImageUploadSection';
import BranchSelector from '@/components/tasks/BranchSelector';
import { AgentSelector } from '@/components/tasks/AgentSelector';
import { ConfigSelector } from '@/components/tasks/ConfigSelector';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useUserSystem } from '@/components/config-provider';
import { imagesApi, projectsApi, attemptsApi } from '@/lib/api';
import { useKeySubmitTask, useKeySubmitTaskAlt, Scope } from '@/keyboard';
import { cn } from '@/lib/utils';
import type {
  TaskStatus,
  ExecutorProfileId,
  ImageResponse,
  GitBranch,
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

export interface TaskFormDialogProps {
  task?: Task | null;
  projectId?: string;
  initialTask?: Task | null;
  initialBaseBranch?: string;
  parentTaskAttemptId?: string;
}

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
  branches: GitBranch[];
};

type Action =
  | { type: 'init'; payload: Partial<State> }
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
  | { type: 'set_discard'; payload: boolean }
  | { type: 'set_branches'; payload: GitBranch[] }
  | { type: 'reset' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'init':
      return { ...initialState, ...action.payload };
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
    case 'set_branches':
      return { ...state, branches: action.payload };
    case 'reset':
      return initialState;
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
  branches: [],
};

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
    const mode = task ? 'edit' : 'create';

    const [state, dispatch] = useReducer(reducer, initialState);
    const imageUploadRef = useRef<ImageUploadSectionHandle>(null);
    const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
    const dragCounterRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch branches in create mode
    useEffect(() => {
      if (!modal.visible || mode === 'edit' || !projectId) return;

      let cancelled = false;
      projectsApi
        .getBranches(projectId)
        .then((projectBranches) => {
          if (cancelled) return;
          dispatch({ type: 'set_branches', payload: projectBranches });

          if (
            initialBaseBranch &&
            projectBranches.some((b) => b.name === initialBaseBranch)
          ) {
            dispatch({ type: 'set_branch', payload: initialBaseBranch });
          } else {
            const currentBranch = projectBranches.find((b) => b.is_current);
            const defaultBranch = currentBranch || projectBranches[0];
            if (defaultBranch) {
              dispatch({ type: 'set_branch', payload: defaultBranch.name });
            }
          }
        })
        .catch(console.error);

      return () => {
        cancelled = true;
      };
    }, [modal.visible, mode, projectId, initialBaseBranch]);

    // Fetch parent base branch when parentTaskAttemptId is provided
    useEffect(() => {
      if (
        !modal.visible ||
        mode === 'edit' ||
        !parentTaskAttemptId ||
        initialBaseBranch ||
        state.branches.length === 0
      ) {
        return;
      }

      let cancelled = false;
      attemptsApi
        .get(parentTaskAttemptId)
        .then((attempt) => {
          if (cancelled) return;
          const parentBranch = attempt.branch || attempt.target_branch;
          if (
            parentBranch &&
            state.branches.some((b) => b.name === parentBranch)
          ) {
            dispatch({ type: 'set_branch', payload: parentBranch });
          }
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }, [
      modal.visible,
      mode,
      parentTaskAttemptId,
      initialBaseBranch,
      state.branches,
    ]);

    // Load images for edit mode
    useEffect(() => {
      if (!task?.id || !modal.visible) return;

      imagesApi
        .getTaskImages(task.id)
        .then((imgs) => {
          dispatch({ type: 'set_images', payload: imgs });
          dispatch({ type: 'set_show_upload', payload: imgs.length > 0 });
        })
        .catch(() => {
          dispatch({ type: 'set_images', payload: [] });
        });
    }, [task?.id, modal.visible]);

    // Initialize form state
    useEffect(() => {
      if (!modal.visible) return;

      if (task) {
        dispatch({
          type: 'init',
          payload: {
            title: task.title,
            description: task.description || '',
            status: task.status,
            selectedBranch: state.selectedBranch,
          },
        });
      } else if (initialTask) {
        dispatch({
          type: 'init',
          payload: {
            title: initialTask.title,
            description: initialTask.description || '',
            status: 'todo',
            selectedExecutorProfile: system.config?.executor_profile || null,
            selectedBranch: state.selectedBranch,
          },
        });
      } else {
        dispatch({
          type: 'init',
          payload: {
            selectedExecutorProfile: system.config?.executor_profile || null,
            selectedBranch: state.selectedBranch,
          },
        });
      }
    }, [task, initialTask, modal.visible, system.config?.executor_profile]);

    // Drag & drop handlers
    const [isDraggingFile, setIsDraggingFile] = useState(false);

    const handleDragEnter = useCallback(
      (e: React.DragEvent) => {
        if (state.isSubmitting) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
          dragCounterRef.current++;
          if (dragCounterRef.current === 1) {
            setIsDraggingFile(true);
          }
        }
      },
      [state.isSubmitting]
    );

    const handleDragLeave = useCallback(
      (e: React.DragEvent) => {
        if (state.isSubmitting) return;
        e.preventDefault();
        e.stopPropagation();
        if (dragCounterRef.current > 0) {
          dragCounterRef.current--;
        }
        if (dragCounterRef.current === 0) {
          setIsDraggingFile(false);
        }
      },
      [state.isSubmitting]
    );

    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        if (state.isSubmitting) return;
        e.preventDefault();
        e.stopPropagation();
      },
      [state.isSubmitting]
    );

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        if (state.isSubmitting) return;
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDraggingFile(false);

        const files = Array.from(e.dataTransfer.files).filter((file) =>
          file.type.startsWith('image/')
        );

        if (files.length > 0) {
          dispatch({ type: 'set_show_upload', payload: true });
          if (imageUploadRef.current) {
            imageUploadRef.current.addFiles(files);
          } else {
            setPendingFiles(files);
          }
        }
      },
      [state.isSubmitting]
    );

    const handleFiles = useCallback((files: File[]) => {
      dispatch({ type: 'set_show_upload', payload: true });
      if (imageUploadRef.current) {
        imageUploadRef.current.addFiles(files);
      } else {
        setPendingFiles(files);
      }
    }, []);

    // Apply pending files when ImageUploadSection becomes available
    useEffect(() => {
      if (pendingFiles && imageUploadRef.current) {
        imageUploadRef.current.addFiles(pendingFiles);
        setPendingFiles(null);
      }
    }, [pendingFiles, state.showImageUpload]);

    // Unsaved changes detection
    const hasUnsavedChanges = useCallback(() => {
      if (mode === 'create') {
        return state.title.trim() !== '' || state.description.trim() !== '';
      } else if (task) {
        return (
          state.title.trim() !== task.title.trim() ||
          (state.description || '').trim() !==
            (task.description || '').trim() ||
          state.status !== task.status
        );
      }
      return false;
    }, [mode, state.title, state.description, state.status, task]);

    // beforeunload listener
    useEffect(() => {
      if (!modal.visible || state.isSubmitting) return;

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
    }, [modal.visible, state.isSubmitting, hasUnsavedChanges]);

    // Submission handlers
    const submit = useCallback(async () => {
      if (!state.title.trim() || !projectId || state.isSubmitting) return;

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

        if (mode === 'edit' && task) {
          await updateTask.mutateAsync(
            {
              taskId: task.id,
              data: {
                title: state.title,
                description: state.description,
                status: state.status,
                parent_task_attempt: parentTaskAttemptId || null,
                image_ids: imageIds || null,
              },
            },
            { onSuccess: () => modal.hide() }
          );
        } else {
          await createTask.mutateAsync(
            {
              project_id: projectId,
              title: state.title,
              description: state.description,
              parent_task_attempt: parentTaskAttemptId || null,
              image_ids: imageIds || null,
            },
            { onSuccess: () => modal.hide() }
          );
        }
      } finally {
        dispatch({ type: 'set_submitting', payload: false });
      }
    }, [
      state,
      projectId,
      mode,
      task,
      parentTaskAttemptId,
      createTask,
      updateTask,
      modal,
    ]);

    const handleCreateAndStart = useCallback(async () => {
      if (
        !state.title.trim() ||
        !projectId ||
        mode === 'edit' ||
        state.isSubmitting
      )
        return;

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
              parent_task_attempt: parentTaskAttemptId || null,
              image_ids: imageIds || null,
            },
            executor_profile_id: finalProfile,
            base_branch: state.selectedBranch,
          },
          { onSuccess: () => modal.hide() }
        );
      } finally {
        dispatch({ type: 'set_submitting', payload: false });
      }
    }, [
      state,
      projectId,
      mode,
      parentTaskAttemptId,
      createAndStart,
      system.config,
      modal,
    ]);

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
        modal.hide();
      }
    };

    const handleDiscardChanges = () => {
      dispatch({ type: 'set_discard', payload: false });
      modal.hide();
    };

    return (
      <>
        <TaskDialog
          open={modal.visible}
          onOpenChange={handleDialogClose}
          className="w-full max-w-[min(90vw,40rem)] max-h-[min(95vh,50rem)]"
          uncloseable={state.showDiscardWarning}
          ariaLabel={mode === 'edit' ? 'Edit task' : 'Create new task'}
        >
          <div
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
                  <ImageIcon className="h-12 w-12 mx-auto mb-2 text-primary-foreground" />
                  <p className="text-lg font-medium text-primary-foreground">
                    Drop images here
                  </p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1 pb-3">
              {/* Title */}
              <div className="pr-8 pt-3">
                <Input
                  id="task-title"
                  value={state.title}
                  onChange={(e) =>
                    dispatch({ type: 'set_title', payload: e.target.value })
                  }
                  placeholder="Task title"
                  className="text-lg font-medium border-none shadow-none px-0 placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  disabled={state.isSubmitting}
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <FileSearchTextarea
                  value={state.description}
                  onChange={(desc) =>
                    dispatch({ type: 'set_description', payload: desc })
                  }
                  rows={4}
                  maxRows={35}
                  placeholder="Add more details (optional). Type @ to search files."
                  className="border-none shadow-none px-0 resize-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  disabled={state.isSubmitting}
                  projectId={projectId}
                  onPasteFiles={handleFiles}
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
                  onUpload={imagesApi.upload}
                  onDelete={imagesApi.delete}
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

              {/* Create mode dropdowns */}
              {mode === 'create' && (
                <div
                  className={cn(
                    'flex items-center gap-2 h-9 transition-opacity duration-200',
                    state.autoStart
                      ? 'opacity-100'
                      : 'opacity-0 pointer-events-none'
                  )}
                >
                  {profiles && (
                    <>
                      <AgentSelector
                        profiles={profiles}
                        selectedExecutorProfile={state.selectedExecutorProfile}
                        onChange={(profile) =>
                          dispatch({ type: 'set_profile', payload: profile })
                        }
                        disabled={state.isSubmitting}
                      />
                      <ConfigSelector
                        profiles={profiles}
                        selectedExecutorProfile={state.selectedExecutorProfile}
                        onChange={(profile) =>
                          dispatch({ type: 'set_profile', payload: profile })
                        }
                        disabled={state.isSubmitting}
                      />
                    </>
                  )}
                  {state.branches.length > 0 && (
                    <BranchSelector
                      branches={state.branches}
                      selectedBranch={state.selectedBranch}
                      onBranchSelect={(branch) =>
                        dispatch({ type: 'set_branch', payload: branch })
                      }
                      placeholder="Branch"
                      className={cn(
                        'h-9 flex-1 text-xs',
                        state.isSubmitting && 'opacity-50 cursor-not-allowed'
                      )}
                    />
                  )}
                </div>
              )}

              {/* Edit mode status */}
              {mode === 'edit' && (
                <div className="space-y-2">
                  <Label htmlFor="task-status" className="text-sm font-medium">
                    Status
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

            {/* Actions */}
            <div className="border-t pt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 w-9 p-0 rounded-none"
                  aria-label="Attach image"
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
                {mode === 'create' && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="autostart-switch"
                      checked={state.autoStart}
                      onCheckedChange={(checked) =>
                        dispatch({ type: 'set_auto_start', payload: checked })
                      }
                      disabled={state.isSubmitting}
                      aria-label="Start"
                    />
                    <Label
                      htmlFor="autostart-switch"
                      className="text-sm cursor-pointer"
                    >
                      Start
                    </Label>
                  </div>
                )}

                {mode === 'edit' ? (
                  <Button
                    onClick={submit}
                    disabled={state.isSubmitting || !state.title.trim()}
                  >
                    {state.isSubmitting ? 'Updating...' : 'Update Task'}
                  </Button>
                ) : (
                  <Button
                    onClick={state.autoStart ? handleCreateAndStart : submit}
                    disabled={
                      state.isSubmitting ||
                      !state.title.trim() ||
                      (state.autoStart &&
                        (!state.selectedExecutorProfile ||
                          !state.selectedBranch))
                    }
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {state.isSubmitting ? 'Creating...' : 'Create'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TaskDialog>

        {/* Discard warning dialog */}
        <Dialog
          open={state.showDiscardWarning}
          onOpenChange={(o) =>
            !o && dispatch({ type: 'set_discard', payload: false })
          }
        >
          <DialogContent className="sm:max-w-[425px] z-[10000]">
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
                onClick={() =>
                  dispatch({ type: 'set_discard', payload: false })
                }
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
