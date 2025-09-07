import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import type {
  ConfirmDialogProps,
  ProvidePatDialogProps,
  DeleteTaskConfirmationDialogProps,
  TaskFormDialogProps,
  EditorSelectionDialogProps,
} from '@/components/dialogs';

// Type definitions for nice-modal-react modal arguments
declare module '@ebay/nice-modal-react' {
  interface ModalArgs {
    // Existing modals
    'github-login': void;
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
    'privacy-opt-in': void;
    'provide-pat': ProvidePatDialogProps;
    'release-notes': void;

    // Task-related modals
    'task-form': TaskFormDialogProps;
    'delete-task-confirmation': DeleteTaskConfirmationDialogProps;
    'editor-selection': EditorSelectionDialogProps;
  }
}

export {};
