import { create } from 'zustand';

export type DiffViewMode = 'unified' | 'split';

type State = {
  mode: DiffViewMode;
  setMode: (mode: DiffViewMode) => void;
  toggle: () => void;
};

export const useDiffViewStore = create<State>((set) => ({
  mode: 'unified',
  setMode: (mode) => set({ mode }),
  toggle: () =>
    set((s) => ({ mode: s.mode === 'unified' ? 'split' : 'unified' })),
}));

export const useDiffViewMode = () => useDiffViewStore((s) => s.mode);
export const useToggleDiffViewMode = () => useDiffViewStore((s) => s.toggle);
