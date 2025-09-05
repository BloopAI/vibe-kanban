import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import type { ConfirmDialogProps } from '@/components/modals/ConfirmDialog';
import type { ProvidePatDialogProps } from '@/components/ProvidePatDialog';
import type { DeleteTaskConfirmationDialogProps } from '@/components/tasks/DeleteTaskConfirmationDialog';
import type { DeleteFileConfirmationDialogProps } from '@/components/tasks/DeleteFileConfirmationDialog';
import type { TaskFormDialogProps } from '@/components/tasks/TaskFormDialog';
import type { EditorSelectionDialogProps } from '@/components/tasks/EditorSelectionDialog';

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
    'delete-file-confirmation': DeleteFileConfirmationDialogProps;
    'editor-selection': EditorSelectionDialogProps;
  }
}

export {};
