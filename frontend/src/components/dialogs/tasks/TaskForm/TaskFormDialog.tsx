import { useEffect, useCallback, useRef } from 'react';
import { TaskDialog, TaskDialogContent } from '../TaskDialog';
import { DragOverlay } from '@/components/tasks/DragOverlay';
import { DiscardWarningDialog } from './DiscardWarningDialog';
import { TitleRow } from './rows/TitleRow';
import { DescriptionRow, type DescriptionRowHandle } from './rows/DescriptionRow';
import { CreateModeDropdownsRow } from './rows/CreateModeDropdownsRow';
import { EditModeStatusRow } from './rows/EditModeStatusRow';
import { ActionsRow } from './rows/ActionsRow';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useUserSystem } from '@/components/config-provider';
import { useDragAndDropUpload } from '@/hooks/useDragAndDropUpload';
import { useTaskBranches } from '@/hooks/useTaskBranches';
import { useTaskImages } from '@/hooks/useTaskImages';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useTaskFormKeyboardShortcuts } from '@/hooks/useTaskFormKeyboardShortcuts';
import {
  useTaskFormStore,
  useTaskFormSubmission,
} from '@/stores/useTaskFormStore';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import type { TaskStatus } from 'shared/types';

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
    const descriptionRowRef = useRef<DescriptionRowHandle>(null);

    const {
      title,
      description,
      status,
      isSubmitting,
      showDiscardWarning,
      setShowImageUpload,
      setDiscardWarning,
      init,
    } = useTaskFormStore();

    // Branch fetching
    const { branches, selectedBranch: fetchedBranch } = useTaskBranches({
      modalVisible: modal.visible,
      isEditMode: mode === 'edit',
      projectId,
      initialBaseBranch,
      parentTaskAttemptId,
    });

    // Sync fetched branch to store
    useEffect(() => {
      if (fetchedBranch) {
        useTaskFormStore.getState().setSelectedBranch(fetchedBranch);
      }
    }, [fetchedBranch]);

    // Image loading for edit mode
    const { resetImages } = useTaskImages({
      taskId: task?.id,
      modalVisible: modal.visible,
    });

    // Initialize form state
    useEffect(() => {
      if (!modal.visible) return;

      if (task) {
        init({
          title: task.title,
          description: task.description || '',
          status: task.status,
        });
      } else if (initialTask) {
        init({
          title: initialTask.title,
          description: initialTask.description || '',
          status: 'todo',
          selectedExecutorProfile: system.config?.executor_profile || null,
        });
        resetImages();
      } else {
        init({
          selectedExecutorProfile: system.config?.executor_profile || null,
        });
      }
    }, [
      task,
      initialTask,
      modal.visible,
      system.config?.executor_profile,
      init,
      resetImages,
    ]);

    // Drag & drop
    const handleFiles = useCallback(
      (files: File[]) => {
        setShowImageUpload(true);
        descriptionRowRef.current?.addFiles(files);
      },
      [setShowImageUpload]
    );

    const { isDraggingFile, handlers: dragHandlers } = useDragAndDropUpload({
      onFiles: handleFiles,
      enabled: !isSubmitting,
    });

    // Unsaved changes detection
    const hasUnsavedChanges = useCallback(() => {
      if (mode === 'create') {
        return title.trim() !== '' || description.trim() !== '';
      } else if (task) {
        return (
          title.trim() !== task.title.trim() ||
          (description || '').trim() !== (task.description || '').trim() ||
          status !== task.status
        );
      }
      return false;
    }, [mode, title, description, status, task]);

    useUnsavedChanges({
      enabled: modal.visible && !isSubmitting,
      hasUnsavedChanges,
    });

    // Form submission (using convenience hook from store)
    const { submit, createAndStart: createAndStartAction } =
      useTaskFormSubmission({
        mode,
        projectId,
        task,
        parentTaskAttemptId,
        onSuccess: () => modal.hide(),
      });

    const handleSubmit = useCallback(() => {
      void submit(createTask, updateTask);
    }, [submit, createTask, updateTask]);

    const handleCreateAndStart = useCallback(() => {
      void createAndStartAction(createAndStart, system.config);
    }, [createAndStartAction, createAndStart, system.config]);

    // Keyboard shortcuts
    useTaskFormKeyboardShortcuts({
      mode,
      enabled: modal.visible,
      onSubmit: handleSubmit,
      onCreateAndStart: handleCreateAndStart,
    });

    // Dialog close handling
    const handleDialogClose = (open: boolean) => {
      if (!open && hasUnsavedChanges()) {
        setDiscardWarning(true);
      } else if (!open) {
        modal.hide();
      }
    };

    const handleDiscardChanges = () => {
      setDiscardWarning(false);
      modal.hide();
    };

    return (
      <>
        <TaskDialog
          open={modal.visible}
          onOpenChange={handleDialogClose}
          className="w-full max-w-[min(90vw,40rem)] max-h-[min(95vh,50rem)]"
          uncloseable={showDiscardWarning}
          ariaLabel={mode === 'edit' ? 'Edit task' : 'Create new task'}
        >
          <TaskDialogContent
            className="h-full overflow-hidden flex flex-col gap-0 px-4 pb-4 relative"
            {...dragHandlers}
          >
            <DragOverlay isDragging={isDraggingFile} />
            <div className="flex-1 overflow-y-auto space-y-1 pb-3">
              <TitleRow disabled={isSubmitting} autoFocus />
              <DescriptionRow
                ref={descriptionRowRef}
                projectId={projectId}
                disabled={isSubmitting}
                onPasteFiles={handleFiles}
              />
              {mode === 'create' && (
                <CreateModeDropdownsRow
                  profiles={profiles}
                  branches={branches}
                  disabled={isSubmitting}
                />
              )}
              {mode === 'edit' && <EditModeStatusRow disabled={isSubmitting} />}
            </div>
            <ActionsRow
              mode={mode}
              onFileSelect={handleFiles}
              onSubmit={handleSubmit}
              onCreateAndStart={handleCreateAndStart}
              canSubmit={!isSubmitting && !!title.trim()}
            />
          </TaskDialogContent>
        </TaskDialog>
        <DiscardWarningDialog
          open={showDiscardWarning}
          onContinue={() => setDiscardWarning(false)}
          onDiscard={handleDiscardChanges}
        />
      </>
    );
  }
);
