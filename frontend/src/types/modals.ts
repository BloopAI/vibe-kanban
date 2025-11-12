import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import type {
  ConfirmDialogProps,
  DeleteTaskConfirmationDialogProps,
  TaskFormDialogProps,
  EditorSelectionDialogProps,
  ShareDialogProps,
  ReassignDialogProps,
  StopShareTaskDialogProps,
} from '@/components/dialogs';

// Type definitions for nice-modal-react modal arguments
declare module '@ebay/nice-modal-react' {
  interface ModalArgs {
    // Existing modals
    'create-pr': {
      attempt: TaskAttempt;
      task: TaskWithAttemptStatus;
      projectId: string;
    };

    // Generic modals
    confirm: ConfirmDialogProps;

    // App flow modals
    disclaimer: void;
    onboarding: void;
    'release-notes': void;

    // Task-related modals
    'task-form': TaskFormDialogProps;
    'delete-task-confirmation': DeleteTaskConfirmationDialogProps;
    'editor-selection': EditorSelectionDialogProps;

    // Share task modals
    'share-task': ShareDialogProps;
    'reassign-shared-task': ReassignDialogProps;
    'stop-share-shared-task': StopShareTaskDialogProps;
  }
}

export {};
