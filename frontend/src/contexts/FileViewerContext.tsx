import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';

/**
 * Display mode for file content.
 * - 'preview': Rendered markdown with formatting
 * - 'raw': Plain text source view
 */
type ViewMode = 'preview' | 'raw';

/**
 * Information about a file to be displayed in the file viewer.
 */
interface FileInfo {
  /** Full path to the file */
  path: string;
  /** Relative path within .claude directory (for claude files) */
  relativePath?: string;
  /** Attempt ID for fetching worktree files */
  attemptId?: string;
  /** True for absolute paths outside the worktree and ~/.claude/ (e.g. project doc files) */
  isAbsolutePath?: boolean;
}

/**
 * State managed by the FileViewerContext.
 */
interface FileViewerState {
  /** Whether the file viewer panel/sheet is currently visible */
  isOpen: boolean;
  /** Array of files currently loaded in the viewer */
  files: FileInfo[];
  /** Index of the currently active/displayed file */
  activeFileIndex: number;
  /** Current view mode (preview or raw) */
  viewMode: ViewMode;
}

/**
 * Context value providing file viewer state and actions.
 */
interface FileViewerContextValue extends FileViewerState {
  /**
   * Open a file in the viewer. If the file is already open, switches to it.
   * @param file - The file information to open
   */
  openFile: (file: FileInfo) => void;
  /** Close the file viewer panel and clear all files */
  closePanel: () => void;
  /**
   * Switch to a different file by index.
   * @param index - The index of the file to display
   */
  setActiveFile: (index: number) => void;
  /**
   * Change the view mode.
   * @param mode - The new view mode ('preview' or 'raw')
   */
  setViewMode: (mode: ViewMode) => void;
}

const FileViewerContext = createContext<FileViewerContextValue | null>(null);

/**
 * Props for the FileViewerProvider component.
 */
interface FileViewerProviderProps {
  /** Child components that will have access to the file viewer context */
  children: ReactNode;
}

/**
 * Context provider for file viewer state management.
 * Manages the list of open files, active file selection, and view mode.
 *
 * @example
 * ```tsx
 * <FileViewerProvider>
 *   <App />
 * </FileViewerProvider>
 * ```
 */
export function FileViewerProvider({ children }: FileViewerProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');

  const openFile = useCallback((file: FileInfo) => {
    setFiles((prev) => {
      // Check if file is already in the list
      const existingIndex = prev.findIndex(
        (f) =>
          f.path === file.path &&
          f.relativePath === file.relativePath &&
          f.attemptId === file.attemptId
      );

      if (existingIndex >= 0) {
        // File already exists, just focus it
        setActiveFileIndex(existingIndex);
        return prev;
      }

      // Add new file and focus it
      const newFiles = [...prev, file];
      setActiveFileIndex(newFiles.length - 1);
      return newFiles;
    });
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    // Clear files when closing panel
    setFiles([]);
    setActiveFileIndex(0);
    setViewMode('preview');
  }, []);

  const setActiveFile = useCallback((index: number) => {
    // Ensure index is not negative (upper bound validated in useMemo)
    setActiveFileIndex(Math.max(0, index));
  }, []);

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const value = useMemo<FileViewerContextValue>(
    () => ({
      isOpen,
      files,
      activeFileIndex: Math.min(activeFileIndex, Math.max(0, files.length - 1)),
      viewMode,
      openFile,
      closePanel,
      setActiveFile,
      setViewMode: handleSetViewMode,
    }),
    [
      isOpen,
      files,
      activeFileIndex,
      viewMode,
      openFile,
      closePanel,
      setActiveFile,
      handleSetViewMode,
    ]
  );

  return (
    <FileViewerContext.Provider value={value}>
      {children}
    </FileViewerContext.Provider>
  );
}

/**
 * Hook to access file viewer state and actions.
 * Must be used within a FileViewerProvider.
 *
 * @returns The file viewer context value with state and action methods
 * @throws Error if used outside of FileViewerProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { openFile, closePanel, isOpen } = useFileViewer();
 *
 *   const handleClick = () => {
 *     openFile({ path: '/path/to/file.md', attemptId: '123' });
 *   };
 *
 *   return <button onClick={handleClick}>Open File</button>;
 * }
 * ```
 */
export function useFileViewer(): FileViewerContextValue {
  const context = useContext(FileViewerContext);
  if (!context) {
    throw new Error('useFileViewer must be used within a FileViewerProvider');
  }
  return context;
}
