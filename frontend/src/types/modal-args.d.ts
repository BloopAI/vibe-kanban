import { TaskWithAttemptStatus, Workspace } from 'shared/types';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';

// Extend nice-modal-react to provide type safety for modal arguments
declare module '@ebay/nice-modal-react' {
  interface ModalArgs {
    'create-pr': {
      attempt: Workspace;
      task: TaskWithAttemptStatus;
      projectId: string;
    };
    'share-task': {
      task: TaskWithAttemptStatus;
    };
    'transfer-shared-task': {
      sharedTask: SharedTaskRecord;
    };
  }
}

export {};
