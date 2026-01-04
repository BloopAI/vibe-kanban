import { IssueDetailDialog } from '@/components/dialogs/issues/IssueDetailDialog';
import type { IssueDetailDialogProps } from '@/components/dialogs/issues/IssueDetailDialog';

/**
 * Open the issue detail dialog programmatically
 */
export function openIssueDetail(props: IssueDetailDialogProps) {
  return IssueDetailDialog.show(props);
}
