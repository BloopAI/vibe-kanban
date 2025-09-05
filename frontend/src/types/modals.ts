import type { TaskAttempt, TaskWithAttemptStatus, TaskTemplate } from 'shared/types';
import type { ConfirmDialogProps } from '@/components/modals/ConfirmDialog';

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
    'confirm': ConfirmDialogProps;
    
    // App flow modals (to be converted)
    'disclaimer': void;
    'onboarding': void;
    'privacy-opt-in': void;
    'provide-pat': {
      errorMessage?: string;
    };
    'release-notes': void;
    
    // Task-related modals (to be converted)
    'task-form': {
      mode: 'create' | 'edit';
      task?: TaskWithAttemptStatus;
      initialTemplate?: TaskTemplate;
    };
    'delete-task': {
      task: TaskWithAttemptStatus;
      projectId: string;
    };
    'delete-file': {
      filePath: string;
      attemptId: string;
    };
    'editor-selection': {
      attempt: TaskAttempt;
    };
  }
}

export {};
