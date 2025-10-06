import { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';

// Extend nice-modal-react to provide type safety for modal arguments
declare module '@ebay/nice-modal-react' {
  interface ModalArgs {
    'github-login': void;
    'create-pr': {
      attempt: TaskAttempt;
      task: TaskWithAttemptStatus;
      projectId: string;
    };
    'share-task': {
      task: TaskWithAttemptStatus;
    };
  }
}

export {};
