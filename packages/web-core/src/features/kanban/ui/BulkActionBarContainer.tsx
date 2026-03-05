import { useCallback, useMemo } from 'react';
import { useActions } from '@/shared/hooks/useActions';
import { Actions } from '@/shared/actions';
import { BulkActionBar } from '@vibe/ui/components/BulkActionBar';
import { useIssueSelectionStore } from '@/shared/stores/useIssueSelectionStore';

interface BulkActionBarContainerProps {
  projectId: string;
}

export function BulkActionBarContainer({
  projectId,
}: BulkActionBarContainerProps) {
  const selectedIssueIds = useIssueSelectionStore((s) => s.selectedIssueIds);
  const clearSelection = useIssueSelectionStore((s) => s.clearSelection);
  const {
    executeAction,
    openStatusSelection,
    openPrioritySelection,
    openAssigneeSelection,
  } = useActions();

  const issueIds = useMemo(() => [...selectedIssueIds], [selectedIssueIds]);

  const handleChangeStatus = useCallback(async () => {
    await openStatusSelection(projectId, issueIds);
    clearSelection();
  }, [projectId, issueIds, openStatusSelection, clearSelection]);

  const handleChangePriority = useCallback(async () => {
    await openPrioritySelection(projectId, issueIds);
    clearSelection();
  }, [projectId, issueIds, openPrioritySelection, clearSelection]);

  const handleChangeAssignees = useCallback(async () => {
    await openAssigneeSelection(projectId, issueIds);
    clearSelection();
  }, [projectId, issueIds, openAssigneeSelection, clearSelection]);

  const handleDelete = useCallback(async () => {
    await executeAction(Actions.DeleteIssue, undefined, projectId, issueIds);
    clearSelection();
  }, [executeAction, projectId, issueIds, clearSelection]);

  return (
    <BulkActionBar
      selectedCount={selectedIssueIds.size}
      onChangeStatus={handleChangeStatus}
      onChangePriority={handleChangePriority}
      onChangeAssignees={handleChangeAssignees}
      onDelete={handleDelete}
      onClearSelection={clearSelection}
    />
  );
}
