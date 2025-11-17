import { showModal } from '@/lib/modals';
import { Modals } from '@/components/dialogs';
import type { TaskFormDialogProps } from '@/components/dialogs/tasks/TaskFormDialog';

/**
 * Open the task form dialog programmatically
 * This replaces the previous TaskFormDialogContainer pattern
 */
export function openTaskForm(props: TaskFormDialogProps) {
  return showModal(Modals.TaskForm, props);
}
