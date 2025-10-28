import NiceModal from '@ebay/nice-modal-react';
import type { TaskFormDialogProps } from '@/components/dialogs/tasks/TaskForm/TaskFormDialog';

/**
 * Open the task form dialog programmatically
 * This replaces the previous TaskFormDialogContainer pattern
 */
export function openTaskForm(props: TaskFormDialogProps) {
  return NiceModal.show('task-form', props);
}
