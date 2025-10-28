import { create } from 'zustand';
import type {
  TaskStatus,
  ExecutorProfileId,
  ImageResponse,
} from 'shared/types';

interface TaskFormState {
  // Form fields
  title: string;
  description: string;
  status: TaskStatus;
  autoStart: boolean;
  selectedExecutorProfile: ExecutorProfileId | null;
  selectedBranch: string;

  // Images
  images: ImageResponse[];
  showImageUpload: boolean;
  newlyUploadedImageIds: string[];

  // UI state
  isSubmitting: boolean;
  showDiscardWarning: boolean;

  // Actions
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setStatus: (status: TaskStatus) => void;
  setAutoStart: (autoStart: boolean) => void;
  setSelectedExecutorProfile: (profile: ExecutorProfileId | null) => void;
  setSelectedBranch: (branch: string) => void;
  setImages: (images: ImageResponse[]) => void;
  setShowImageUpload: (show: boolean) => void;
  addNewlyUploadedImageId: (id: string) => void;
  setSubmitting: (submitting: boolean) => void;
  setDiscardWarning: (show: boolean) => void;
  reset: () => void;
  init: (partial: Partial<Omit<TaskFormState, keyof TaskFormActions>>) => void;
}

type TaskFormActions = {
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setStatus: (status: TaskStatus) => void;
  setAutoStart: (autoStart: boolean) => void;
  setSelectedExecutorProfile: (profile: ExecutorProfileId | null) => void;
  setSelectedBranch: (branch: string) => void;
  setImages: (images: ImageResponse[]) => void;
  setShowImageUpload: (show: boolean) => void;
  addNewlyUploadedImageId: (id: string) => void;
  setSubmitting: (submitting: boolean) => void;
  setDiscardWarning: (show: boolean) => void;
  reset: () => void;
  init: (partial: Partial<Omit<TaskFormState, keyof TaskFormActions>>) => void;
};

const initialState = {
  title: '',
  description: '',
  status: 'todo' as TaskStatus,
  autoStart: true,
  selectedExecutorProfile: null,
  selectedBranch: '',
  images: [],
  showImageUpload: false,
  newlyUploadedImageIds: [],
  isSubmitting: false,
  showDiscardWarning: false,
};

export const useTaskFormStore = create<TaskFormState>((set) => ({
  ...initialState,

  setTitle: (title) => set({ title }),
  setDescription: (description) => set({ description }),
  setStatus: (status) => set({ status }),
  setAutoStart: (autoStart) => set({ autoStart }),
  setSelectedExecutorProfile: (selectedExecutorProfile) =>
    set({ selectedExecutorProfile }),
  setSelectedBranch: (selectedBranch) => set({ selectedBranch }),
  setImages: (images) => set({ images }),
  setShowImageUpload: (showImageUpload) => set({ showImageUpload }),
  addNewlyUploadedImageId: (id) =>
    set((state) => ({
      newlyUploadedImageIds: [...state.newlyUploadedImageIds, id],
    })),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  setDiscardWarning: (showDiscardWarning) => set({ showDiscardWarning }),
  reset: () => set(initialState),
  init: (partial) => set({ ...initialState, ...partial }),
}));

// Convenience hooks following useExpandable pattern

export function useTaskFormSubmission({
  mode,
  projectId,
  task,
  parentTaskAttemptId,
  onSuccess,
}: {
  mode: 'create' | 'edit';
  projectId?: string;
  task?: {
    id: string;
    title: string;
    description: string | null;
    status: string;
  } | null;
  parentTaskAttemptId?: string;
  onSuccess?: () => void;
}) {
  const {
    title,
    description,
    status,
    images,
    newlyUploadedImageIds,
    isSubmitting,
    setSubmitting,
    selectedExecutorProfile,
    selectedBranch,
  } = useTaskFormStore();

  const submit = async (
    createTask: any,
    updateTask: any
  ): Promise<void> => {
    if (!title.trim() || !projectId || isSubmitting) return;

    setSubmitting(true);
    try {
      const imageIds =
        mode === 'edit'
          ? images.length > 0
            ? images.map((img) => img.id)
            : undefined
          : newlyUploadedImageIds.length > 0
            ? newlyUploadedImageIds
            : undefined;

      if (mode === 'edit' && task) {
        await updateTask.mutateAsync(
          {
            taskId: task.id,
            data: {
              title,
              description,
              status,
              parent_task_attempt: parentTaskAttemptId || null,
              image_ids: imageIds || null,
            },
          },
          { onSuccess }
        );
      } else {
        await createTask.mutateAsync(
          {
            project_id: projectId,
            title,
            description,
            parent_task_attempt: parentTaskAttemptId || null,
            image_ids: imageIds || null,
          },
          { onSuccess }
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const createAndStart = async (
    createAndStartMutation: any,
    systemConfig: any
  ): Promise<void> => {
    if (!title.trim() || !projectId || mode === 'edit' || isSubmitting) return;

    setSubmitting(true);
    try {
      const finalProfile = selectedExecutorProfile || systemConfig?.executor_profile;
      if (!finalProfile || !selectedBranch) {
        console.warn('Missing executor profile or branch for Create & Start');
        return;
      }

      const imageIds =
        newlyUploadedImageIds.length > 0 ? newlyUploadedImageIds : undefined;

      await createAndStartMutation.mutateAsync(
        {
          task: {
            project_id: projectId,
            title,
            description,
            parent_task_attempt: parentTaskAttemptId || null,
            image_ids: imageIds || null,
          },
          executor_profile_id: finalProfile,
          base_branch: selectedBranch,
        },
        { onSuccess }
      );
    } finally {
      setSubmitting(false);
    }
  };

  return { submit, createAndStart };
}
