import { useCallback, type MouseEvent } from 'react';
import { useIssueSelectionStore } from '@/shared/stores/useIssueSelectionStore';

export function useIssueMultiSelect() {
  const selectedIssueIds = useIssueSelectionStore((s) => s.selectedIssueIds);
  const toggleIssue = useIssueSelectionStore((s) => s.toggleIssue);
  const selectRange = useIssueSelectionStore((s) => s.selectRange);
  const clearSelection = useIssueSelectionStore((s) => s.clearSelection);
  const selectAll = useIssueSelectionStore((s) => s.selectAll);

  const isMultiSelectActive = selectedIssueIds.size > 1;

  const handleIssueClick = useCallback(
    (issueId: string, event: MouseEvent) => {
      const isMetaClick = event.metaKey || event.ctrlKey;
      const isShiftClick = event.shiftKey;

      if (isMetaClick) {
        // Cmd/Ctrl+Click: toggle this issue in multi-select
        event.preventDefault();
        toggleIssue(issueId);
      } else if (isShiftClick) {
        // Shift+Click: range select from anchor to this issue
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        selectRange(issueId);
      }
    },
    [toggleIssue, selectRange]
  );

  const handleCheckboxChange = useCallback(
    (issueId: string, _checked?: boolean) => {
      toggleIssue(issueId);
    },
    [toggleIssue]
  );

  return {
    selectedIssueIds,
    isMultiSelectActive,
    handleIssueClick,
    handleCheckboxChange,
    handleSelectAll: selectAll,
    clearSelection,
  };
}
