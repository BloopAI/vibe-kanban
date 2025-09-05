import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';

// Type definitions for nice-modal-react modal arguments
declare module '@ebay/nice-modal-react' {
  interface ModalArgs {
    'github-login': void;
    'create-pr': {
      attempt: TaskAttempt;
      task: TaskWithAttemptStatus;
      projectId: string;
    };
  }
}

export {};
