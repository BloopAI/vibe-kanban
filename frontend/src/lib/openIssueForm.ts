import { IssueFormDialog } from '@/components/dialogs/issues/IssueFormDialog';
import type { IssueFormDialogProps } from '@/components/dialogs/issues/IssueFormDialog';

/**
 * Open the Linear-style issue form dialog programmatically
 */
export function openIssueForm(props: IssueFormDialogProps) {
  return IssueFormDialog.show(props);
}
