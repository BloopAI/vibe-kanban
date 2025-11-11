import NiceModal from '@ebay/nice-modal-react';
import type {
  FolderPickerDialogProps,
  TagEditDialogProps,
  TagEditResult,
  ProjectFormDialogProps,
  ProjectFormDialogResult,
  LinkProjectResult,
} from '@/components/dialogs';

/**
 * Typed wrapper around NiceModal.show with better TypeScript support
 * @param modal - Modal ID (string) or component reference
 * @param props - Props to pass to the modal
 * @returns Promise that resolves with the modal's result
 */
export function showModal<T = void>(
  modal: string,
  props: Record<string, unknown> = {}
): Promise<T> {
  return NiceModal.show<T>(modal, props) as Promise<T>;
}

/**
 * Show folder picker dialog
 * @param props - Props for folder picker
 * @returns Promise that resolves with selected path or null if cancelled
 */
export function showFolderPicker(
  props: FolderPickerDialogProps = {}
): Promise<string | null> {
  return showModal<string | null>(
    'folder-picker',
    props as Record<string, unknown>
  );
}

/**
 * Show task tag edit dialog
 * @param props - Props for tag edit dialog
 * @returns Promise that resolves with 'saved' or 'canceled'
 */
export function showTagEdit(props: TagEditDialogProps): Promise<TagEditResult> {
  return showModal<TagEditResult>('tag-edit', props as Record<string, unknown>);
}

/**
 * Show project form dialog
 * @param props - Props for project form dialog
 * @returns Promise that resolves with 'saved' or 'canceled'
 */
export function showProjectForm(
  props: ProjectFormDialogProps = {}
): Promise<ProjectFormDialogResult> {
  return showModal<ProjectFormDialogResult>(
    'project-form',
    props as Record<string, unknown>
  );
}

/**
 * Show link project dialog
 * @param props - Props for link project dialog (projectId and projectName)
 * @returns Promise that resolves with link result
 */
export function showLinkProject(props: {
  projectId: string;
  projectName: string;
}): Promise<LinkProjectResult> {
  return showModal<LinkProjectResult>(
    'link-project',
    props as Record<string, unknown>
  );
}

/**
 * Hide a modal by ID
 */
export function hideModal(modal: string): void {
  NiceModal.hide(modal);
}

/**
 * Remove a modal by ID
 */
export function removeModal(modal: string): void {
  NiceModal.remove(modal);
}

/**
 * Hide all currently visible modals
 */
export function hideAllModals(): void {
  // NiceModal doesn't have a direct hideAll, so we'll implement as needed
  console.log('Hide all modals - implement as needed');
}

/**
 * Common modal result types for standardization
 */
export type ConfirmResult = 'confirmed' | 'canceled';
export type DeleteResult = 'deleted' | 'canceled';
export type SaveResult = 'saved' | 'canceled';

/**
 * Error handling utility for modal operations
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}
