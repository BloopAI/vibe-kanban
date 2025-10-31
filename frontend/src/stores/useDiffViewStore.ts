import { create } from 'zustand';

export type DiffViewMode = 'unified' | 'split';

type State = {
  mode: DiffViewMode;
  setMode: (mode: DiffViewMode) => void;
  toggle: () => void;
  ignoreWhitespace: boolean;
  setIgnoreWhitespace: (value: boolean) => void;
};

export const useDiffViewStore = create<State>((set) => ({
  mode: 'unified',
  setMode: (mode) => set({ mode }),
  toggle: () =>
    set((s) => ({ mode: s.mode === 'unified' ? 'split' : 'unified' })),
  ignoreWhitespace: true,
  setIgnoreWhitespace: (value) => set({ ignoreWhitespace: value }),
}));

export const useDiffViewMode = () => useDiffViewStore((s) => s.mode);
export const useIgnoreWhitespaceDiff = () =>
  useDiffViewStore((s) => s.ignoreWhitespace);
