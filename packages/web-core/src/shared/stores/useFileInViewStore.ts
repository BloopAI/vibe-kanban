import { create } from 'zustand';

interface FileInViewState {
  fileInView: string | null;
  setFileInView: (path: string | null) => void;
}

export const useFileInViewStore = create<FileInViewState>()((set) => ({
  fileInView: null,
  setFileInView: (path) =>
    set((s) => (s.fileInView === path ? s : { fileInView: path })),
}));

export const useFileInView = () => useFileInViewStore((s) => s.fileInView);
