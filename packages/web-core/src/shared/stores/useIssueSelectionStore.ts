import { create } from 'zustand';

interface IssueSelectionState {
  /** Set of currently selected issue IDs */
  selectedIssueIds: Set<string>;
  /** Anchor issue for Shift+Click range selection */
  anchorIssueId: string | null;
  /** Flat ordered list of all visible issue IDs (set by the kanban container) */
  orderedIssueIds: string[];

  toggleIssue: (issueId: string) => void;
  selectRange: (targetIssueId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setOrderedIssueIds: (ids: string[]) => void;
}

export const useIssueSelectionStore = create<IssueSelectionState>(
  (set, get) => ({
    selectedIssueIds: new Set<string>(),
    anchorIssueId: null,
    orderedIssueIds: [],

    toggleIssue: (issueId: string) => {
      const { selectedIssueIds } = get();
      const next = new Set(selectedIssueIds);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      set({
        selectedIssueIds: next,
        anchorIssueId: issueId,
      });
    },

    selectRange: (targetIssueId: string) => {
      const { anchorIssueId, orderedIssueIds, selectedIssueIds } = get();
      if (!anchorIssueId) {
        // No anchor — just select the target
        set({
          selectedIssueIds: new Set([targetIssueId]),
          anchorIssueId: targetIssueId,
        });
        return;
      }

      const anchorIndex = orderedIssueIds.indexOf(anchorIssueId);
      const targetIndex = orderedIssueIds.indexOf(targetIssueId);

      if (anchorIndex === -1 || targetIndex === -1) {
        // Fallback if IDs not in the ordered list
        set({
          selectedIssueIds: new Set([targetIssueId]),
          anchorIssueId: targetIssueId,
        });
        return;
      }

      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      const rangeIds = orderedIssueIds.slice(start, end + 1);

      // Union with existing selection
      const next = new Set(selectedIssueIds);
      for (const id of rangeIds) {
        next.add(id);
      }
      set({ selectedIssueIds: next });
    },

    selectAll: () => {
      const { orderedIssueIds } = get();
      set({ selectedIssueIds: new Set(orderedIssueIds) });
    },

    clearSelection: () => {
      set({
        selectedIssueIds: new Set<string>(),
        anchorIssueId: null,
      });
    },

    setOrderedIssueIds: (ids: string[]) => {
      set({ orderedIssueIds: ids });
    },
  })
);
