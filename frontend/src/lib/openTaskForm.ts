import { TaskFormDialog } from '@/components/dialogs/tasks/TaskFormDialog';
import type { TaskFormDialogProps } from '@/components/dialogs/tasks/TaskFormDialog';

/**
 * Open the task form dialog programmatically
 * This replaces the previous TaskFormDialogContainer pattern
 */
export function openTaskForm(props: TaskFormDialogProps) {
  return TaskFormDialog.show(props);
}
