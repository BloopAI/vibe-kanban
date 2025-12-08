import { create } from 'zustand';

export interface ScrollTarget {
  filePath: string;
  lineNumber: number;
  side: 'old' | 'new';
}

type State = {
  scrollTarget: ScrollTarget | null;
  setScrollTarget: (target: ScrollTarget) => void;
  clearScrollTarget: () => void;
};

export const useScrollToLineStore = create<State>((set) => ({
  scrollTarget: null,
  setScrollTarget: (target) => set({ scrollTarget: target }),
  clearScrollTarget: () => set({ scrollTarget: null }),
}));
