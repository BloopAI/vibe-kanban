import type { Workspace } from 'shared/types';
import type {
  ConfirmDialogProps,
  EditorSelectionDialogProps,
} from '@/components/dialogs';

// Type definitions for nice-modal-react modal arguments
declare module '@ebay/nice-modal-react' {
  interface ModalArgs {
    // Existing modals
    'create-pr': {
      attempt: Workspace;
      projectId: string;
    };

    // Generic modals
    confirm: ConfirmDialogProps;

    // App flow modals
    'release-notes': void;

    'editor-selection': EditorSelectionDialogProps;
  }
}

export {};
