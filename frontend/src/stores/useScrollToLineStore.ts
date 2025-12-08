import { create } from 'zustand';

export interface ScrollTarget {
  filePath: string;
  lineNumber: number;
  side: 'old' | 'new';
}

type State = {
  scrollTarget: ScrollTarget | null;
  /** Flag to request opening the diffs panel before scrolling */
  shouldOpenDiffsPanel: boolean;
  setScrollTarget: (target: ScrollTarget) => void;
  clearScrollTarget: () => void;
  /** Clear the flag after the diffs panel has been opened */
  clearShouldOpenDiffsPanel: () => void;
};

export const useScrollToLineStore = create<State>((set) => ({
  scrollTarget: null,
  shouldOpenDiffsPanel: false,
  setScrollTarget: (target) => set({ scrollTarget: target, shouldOpenDiffsPanel: true }),
  clearScrollTarget: () => set({ scrollTarget: null }),
  clearShouldOpenDiffsPanel: () => set({ shouldOpenDiffsPanel: false }),
}));
