import { TaskAttempt } from 'shared/types';

// Extend nice-modal-react to provide type safety for modal arguments
declare module '@ebay/nice-modal-react' {
  interface ModalArgs {
    'github-login': void;
    'create-pr': {
      attempt: TaskAttempt;
      task: any; // Will be properly typed when we have the full task type
      projectId: string;
    };
  }
}

export {};
