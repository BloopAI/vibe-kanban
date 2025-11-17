import NiceModal from '@ebay/nice-modal-react';
import type React from 'react';

// Brand a component with its modal result type (props are inferred)
export type ModalResultOf<M> = M extends { __modalResult?: infer R }
  ? R
  : never;
export type ModalPropsOf<M> =
  M extends React.ComponentType<infer P> ? P : never;

export function defineModal<R>(component: React.ComponentType<any>) {
  return component as React.ComponentType<any> & { __modalResult?: R };
}

// Fully typed show using the component as the identifier
export function showModal<M extends React.ComponentType<any>>(
  modal: M,
  props: ModalPropsOf<M>
): Promise<ModalResultOf<M>> {
  return NiceModal.show(modal as any, props) as Promise<ModalResultOf<M>>;
}

// Optional typed hide/remove if you need them globally
export function hideModal<M extends React.ComponentType<any>>(modal: M): void {
  NiceModal.hide(modal as any);
}

export function removeModal<M extends React.ComponentType<any>>(
  modal: M
): void {
  NiceModal.remove(modal as any);
}

// Common modal result types for standardization
export type ConfirmResult = 'confirmed' | 'canceled';
export type DeleteResult = 'deleted' | 'canceled';
export type SaveResult = 'saved' | 'canceled';

// Error handling utility for modal operations
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

// Legacy helper functions - kept for backward compatibility
// These will be migrated to use Modals registry over time
import { Modals } from '@/components/dialogs';
import type {
  FolderPickerDialogProps,
  TagEditDialogProps,
  TagEditResult,
  ProjectFormDialogProps,
  ProjectFormDialogResult,
  LinkProjectResult,
} from '@/components/dialogs';

export function showFolderPicker(
  props: FolderPickerDialogProps = {}
): Promise<string | null> {
  return showModal(Modals.FolderPicker, props);
}

export function showTagEdit(props: TagEditDialogProps): Promise<TagEditResult> {
  return showModal(Modals.TagEdit, props);
}

export function showProjectForm(
  props: ProjectFormDialogProps = {}
): Promise<ProjectFormDialogResult> {
  return showModal(Modals.ProjectForm, props);
}

export function showLinkProject(props: {
  projectId: string;
  projectName: string;
}): Promise<LinkProjectResult> {
  return showModal(Modals.LinkProject, props);
}
