import { create } from 'zustand';

interface IssueSelectionState {
  /** Set of currently selected issue IDs */
  selectedIssueIds: Set<string>;
  /** Anchor issue for Shift+Click range selection */
  anchorIssueId: string | null;
  /** Cursor position for keyboard-driven selection (Shift+J/K) */
  cursorIssueId: string | null;
  /** Flat ordered list of all visible issue IDs (set by the kanban container) */
  orderedIssueIds: string[];

  toggleIssue: (issueId: string) => void;
  selectRange: (targetIssueId: string) => void;
  /** Extend selection by one issue in the given direction (for Shift+J/K) */
  selectAdjacent: (
    direction: 'up' | 'down',
    fallbackIssueId?: string | null
  ) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setOrderedIssueIds: (ids: string[]) => void;
}

export const useIssueSelectionStore = create<IssueSelectionState>(
  (set, get) => ({
    selectedIssueIds: new Set<string>(),
    anchorIssueId: null,
    cursorIssueId: null,
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
        cursorIssueId: issueId,
      });
    },

    selectRange: (targetIssueId: string) => {
      const { anchorIssueId, orderedIssueIds, selectedIssueIds } = get();
      if (!anchorIssueId) {
        // No anchor — just select the target
        set({
          selectedIssueIds: new Set([targetIssueId]),
          anchorIssueId: targetIssueId,
          cursorIssueId: targetIssueId,
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
          cursorIssueId: targetIssueId,
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
      set({ selectedIssueIds: next, cursorIssueId: targetIssueId });
    },

    selectAdjacent: (
      direction: 'up' | 'down',
      fallbackIssueId?: string | null
    ) => {
      const {
        anchorIssueId,
        cursorIssueId,
        orderedIssueIds,
        selectedIssueIds,
      } = get();
      if (orderedIssueIds.length === 0) return;

      // Determine starting point: cursor > anchor > fallback (open issue) > first
      const startId = cursorIssueId ?? anchorIssueId ?? fallbackIssueId ?? null;
      const startIndex = startId ? orderedIssueIds.indexOf(startId) : -1;

      if (startIndex === -1 && selectedIssueIds.size === 0) {
        // No starting point — select the first or last issue to begin
        const id =
          direction === 'down'
            ? orderedIssueIds[0]
            : orderedIssueIds[orderedIssueIds.length - 1];
        set({
          selectedIssueIds: new Set([id]),
          anchorIssueId: id,
          cursorIssueId: id,
        });
        return;
      }

      const effectiveIndex = startIndex === -1 ? 0 : startIndex;
      const nextIndex =
        direction === 'down' ? effectiveIndex + 1 : effectiveIndex - 1;

      // Clamp to bounds
      if (nextIndex < 0 || nextIndex >= orderedIssueIds.length) return;

      const nextId = orderedIssueIds[nextIndex];

      // Set anchor if none exists
      const effectiveAnchor = anchorIssueId ?? orderedIssueIds[effectiveIndex];

      // Build range from anchor to new cursor
      const anchorIndex = orderedIssueIds.indexOf(effectiveAnchor);
      const rangeStart = Math.min(anchorIndex, nextIndex);
      const rangeEnd = Math.max(anchorIndex, nextIndex);
      const rangeIds = orderedIssueIds.slice(rangeStart, rangeEnd + 1);

      set({
        selectedIssueIds: new Set(rangeIds),
        anchorIssueId: effectiveAnchor,
        cursorIssueId: nextId,
      });
    },

    selectAll: () => {
      const { orderedIssueIds } = get();
      set({ selectedIssueIds: new Set(orderedIssueIds) });
    },

    clearSelection: () => {
      set({
        selectedIssueIds: new Set<string>(),
        anchorIssueId: null,
        cursorIssueId: null,
      });
    },

    setOrderedIssueIds: (ids: string[]) => {
      set({ orderedIssueIds: ids });
    },
  })
);
