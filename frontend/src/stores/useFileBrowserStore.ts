import { create } from 'zustand';

export type FileSource = 'worktree' | 'main';
export type MarkdownViewMode = 'preview' | 'raw';

interface FileBrowserState {
  // Source toggle (worktree vs main project)
  source: FileSource;
  setSource: (source: FileSource) => void;

  // Current directory path being viewed
  currentPath: string | null;
  setCurrentPath: (path: string | null) => void;

  // Currently selected file to view
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;

  // Path history for back navigation on mobile
  pathHistory: string[];
  pushPath: (path: string) => void;
  popPath: () => string | null;
  clearHistory: () => void;

  // Markdown view mode (preview or raw)
  markdownViewMode: MarkdownViewMode;
  setMarkdownViewMode: (mode: MarkdownViewMode) => void;
  toggleMarkdownViewMode: () => void;

  // Filter/search term for file list
  filterTerm: string;
  setFilterTerm: (term: string) => void;

  // Reset entire state (e.g., when switching contexts)
  reset: () => void;
}

const initialState = {
  source: 'worktree' as FileSource,
  currentPath: null,
  selectedFile: null,
  pathHistory: [] as string[],
  markdownViewMode: 'preview' as MarkdownViewMode,
  filterTerm: '',
};

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  ...initialState,

  setSource: (source) => set({ source, selectedFile: null, currentPath: null }),

  setCurrentPath: (path) => set({ currentPath: path }),

  setSelectedFile: (file) => set({ selectedFile: file }),

  pushPath: (path) =>
    set((state) => ({
      pathHistory: [...state.pathHistory, state.currentPath ?? ''],
      currentPath: path,
    })),

  popPath: () => {
    const { pathHistory } = get();
    if (pathHistory.length === 0) return null;

    const previousPath = pathHistory[pathHistory.length - 1];
    set({
      pathHistory: pathHistory.slice(0, -1),
      currentPath: previousPath || null,
    });
    return previousPath;
  },

  clearHistory: () => set({ pathHistory: [] }),

  setMarkdownViewMode: (mode) => set({ markdownViewMode: mode }),

  toggleMarkdownViewMode: () =>
    set((state) => ({
      markdownViewMode: state.markdownViewMode === 'preview' ? 'raw' : 'preview',
    })),

  setFilterTerm: (term) => set({ filterTerm: term }),

  reset: () => set(initialState),
}));

// Selector hooks for convenience
export const useFileSource = () => useFileBrowserStore((s) => s.source);
export const useCurrentPath = () => useFileBrowserStore((s) => s.currentPath);
export const useSelectedFile = () => useFileBrowserStore((s) => s.selectedFile);
export const useMarkdownViewMode = () =>
  useFileBrowserStore((s) => s.markdownViewMode);
export const useFileFilterTerm = () => useFileBrowserStore((s) => s.filterTerm);
