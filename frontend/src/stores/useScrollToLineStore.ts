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
  /** Flag indicating we need a longer delay (panel was not already open) */
  needsLongDelay: boolean;
  setScrollTarget: (target: ScrollTarget) => void;
  clearScrollTarget: () => void;
  /** Clear the flag after the diffs panel has been opened */
  clearShouldOpenDiffsPanel: (panelWasAlreadyOpen: boolean) => void;
};

export const useScrollToLineStore = create<State>((set) => ({
  scrollTarget: null,
  shouldOpenDiffsPanel: false,
  needsLongDelay: false,
  setScrollTarget: (target) =>
    set({ scrollTarget: target, shouldOpenDiffsPanel: true }),
  clearScrollTarget: () => set({ scrollTarget: null, needsLongDelay: false }),
  clearShouldOpenDiffsPanel: (panelWasAlreadyOpen) =>
    set({ shouldOpenDiffsPanel: false, needsLongDelay: !panelWasAlreadyOpen }),
}));
